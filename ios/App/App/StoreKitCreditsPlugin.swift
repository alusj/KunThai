import Foundation
import Capacitor
import StoreKit

// Apple In-App Purchase (StoreKit 2) for Visibility Credits in the KunThai iOS
// app. Kept inside the App target like KunThaiAppleSignInPlugin, so
// `npx cap sync ios` never touches it. JS side:
// src/Backend/services/appleIapService.js.
//
// A purchase is NOT finished here. The app sends Apple's signed transaction
// (JWS) to KunThai's server, which verifies it with Apple's certificates and
// adds the credits; only then does the app call finish(). An unfinished
// transaction (app closed, no connection) is offered again through
// unfinishedTransactions() and the "transaction" event, so a paid purchase is
// never lost. Nothing secret is logged.
@objc(KunThaiStoreKitPlugin)
public class KunThaiStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KunThaiStoreKitPlugin"
    public let jsName = "KunThaiStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinishedTransactions", returnType: CAPPluginReturnPromise),
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Transactions completed outside a purchase() call: Ask to Buy approvals,
        // purchases interrupted by a crash, or made on another device.
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if let payload = Self.payload(for: result) {
                    self.notifyListeners("transaction", data: payload, retainUntilConsumed: true)
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    private static func payload(for result: VerificationResult<Transaction>) -> [String: Any]? {
        // Unverified transactions are still sent: the server re-verifies every
        // JWS with Apple's certificate chain and refuses anything invalid.
        let transaction: Transaction
        switch result {
        case .verified(let value): transaction = value
        case .unverified(let value, _): transaction = value
        }
        guard transaction.productType == .consumable, transaction.revocationDate == nil else { return nil }
        return [
            "transactionId": String(transaction.id),
            "productId": transaction.productID,
            "signedTransaction": result.jwsRepresentation,
        ]
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = (call.getArray("productIds") as? [String] ?? []).filter { !$0.isEmpty }
        guard !ids.isEmpty else {
            call.reject("Product IDs are required.", "missing_products")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve([
                    "products": products.map { product in
                        [
                            "productId": product.id,
                            "displayName": product.displayName,
                            "description": product.description,
                            "displayPrice": product.displayPrice,
                        ]
                    },
                ])
            } catch {
                call.reject("The App Store could not load the credit packs.", "products_unavailable")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("A product is required.", "missing_product")
            return
        }
        // Ties the transaction to the signed-in KunThai account; the server only
        // credits the account whose id matches.
        guard let token = call.getString("appAccountToken"), let accountToken = UUID(uuidString: token) else {
            call.reject("Sign in to buy Visibility Credits.", "missing_account")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This credit pack is not available.", "product_unavailable")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(accountToken)])
                switch result {
                case .success(let verification):
                    guard let payload = Self.payload(for: verification) else {
                        call.reject("The App Store did not confirm this purchase.", "not_verified")
                        return
                    }
                    var response = payload
                    response["status"] = "purchased"
                    call.resolve(response)
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask to Buy or a payment that needs action: delivered later
                    // through the "transaction" event.
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject("The purchase could not be completed.", "purchase_failed")
            }
        }
    }

    // Called only after KunThai's server has added the credits.
    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId"), let transactionId = UInt64(id) else {
            call.reject("A transaction is required.", "missing_transaction")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                let transaction: Transaction
                switch result {
                case .verified(let value): transaction = value
                case .unverified(let value, _): transaction = value
                }
                if transaction.id == transactionId {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            // Already finished (e.g. by an earlier attempt).
            call.resolve(["finished": false])
        }
    }

    // Paid but not yet credited (app closed or offline at the time).
    @objc func unfinishedTransactions(_ call: CAPPluginCall) {
        Task {
            var items: [[String: Any]] = []
            for await result in Transaction.unfinished {
                if let payload = Self.payload(for: result) { items.append(payload) }
            }
            call.resolve(["transactions": items])
        }
    }
}
