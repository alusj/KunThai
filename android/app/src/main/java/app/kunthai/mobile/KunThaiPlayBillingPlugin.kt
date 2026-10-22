package app.kunthai.mobile

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Google Play Billing for Visibility Credits in the KunThai Android app. Kept
// inside the app module like KunThaiVideoPlugin (registered in MainActivity),
// so `npx cap sync android` never touches it. JS side:
// src/Backend/services/googlePlayBillingService.js.
//
// A purchase is NOT consumed here on its own. The app sends the purchase token
// to KunThai's server, which checks it with the Google Play Developer API and
// adds the credits; only then does the app call consume(). A purchase left
// unconsumed (app closed, no connection) is offered again through
// pendingPurchases() and the "purchase" event, so a paid purchase is never
// lost. Nothing secret is logged.
@CapacitorPlugin(name = "KunThaiPlayBilling")
class KunThaiPlayBillingPlugin : Plugin(), PurchasesUpdatedListener {
    private lateinit var billingClient: BillingClient
    private val waitingForConnection = mutableListOf<Pair<() -> Unit, (BillingResult) -> Unit>>()
    private var connecting = false

    // The purchase() call waiting for Google Play's purchase sheet to close.
    private var purchaseCall: PluginCall? = null
    private var purchaseProductId: String? = null

    override fun load() {
        billingClient = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build()
        whenConnected({}, {})
    }

    override fun handleOnResume() {
        super.handleOnResume()
        // Purchases completed while KunThai was in the background (a pending
        // cash payment that went through, a purchase from the Play Store app).
        if (!::billingClient.isInitialized || purchaseCall != null) return
        queryPurchases({ purchases ->
            purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                .forEach { notifyListeners("purchase", payload(it), true) }
        }, {})
    }

    override fun handleOnDestroy() {
        if (::billingClient.isInitialized) billingClient.endConnection()
        super.handleOnDestroy()
    }

    private fun whenConnected(onReady: () -> Unit, onError: (BillingResult) -> Unit) {
        if (billingClient.isReady) {
            onReady()
            return
        }
        synchronized(waitingForConnection) {
            waitingForConnection.add(onReady to onError)
            if (connecting) return
            connecting = true
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                val waiting = synchronized(waitingForConnection) {
                    connecting = false
                    waitingForConnection.toList().also { waitingForConnection.clear() }
                }
                waiting.forEach { (ready, error) ->
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) ready() else error(result)
                }
            }

            override fun onBillingServiceDisconnected() {
                // enableAutoServiceReconnection() reconnects on the next call.
            }
        })
    }

    private fun payload(purchase: Purchase): JSObject {
        val data = JSObject()
        data.put("purchaseToken", purchase.purchaseToken)
        data.put("orderId", purchase.orderId ?: "")
        data.put("productId", purchase.products.firstOrNull() ?: "")
        data.put("quantity", purchase.quantity)
        data.put(
            "purchaseState",
            if (purchase.purchaseState == Purchase.PurchaseState.PENDING) "pending" else if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) "purchased" else "unknown",
        )
        return data
    }

    private fun queryProductDetails(ids: List<String>, onResult: (List<ProductDetails>) -> Unit, onError: (BillingResult) -> Unit) {
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(ids.map {
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(it)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            })
            .build()
        whenConnected({
            billingClient.queryProductDetailsAsync(params) { result, details ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) onResult(details.productDetailsList) else onError(result)
            }
        }, onError)
    }

    private fun queryPurchases(onResult: (List<Purchase>) -> Unit, onError: (BillingResult) -> Unit) {
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
        whenConnected({
            billingClient.queryPurchasesAsync(params) { result, purchases ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) onResult(purchases) else onError(result)
            }
        }, onError)
    }

    @PluginMethod
    fun getProducts(call: PluginCall) {
        val ids = (call.getArray("productIds")?.toList<String>() ?: emptyList()).filter { it.isNotEmpty() }
        if (ids.isEmpty()) {
            call.reject("Product IDs are required.", "missing_products")
            return
        }
        queryProductDetails(ids, { details ->
            val products = JSArray()
            details.forEach { product ->
                val item = JSObject()
                item.put("productId", product.productId)
                item.put("displayName", product.name)
                item.put("description", product.description)
                item.put("displayPrice", product.oneTimePurchaseOfferDetails?.formattedPrice ?: "")
                products.put(item)
            }
            call.resolve(JSObject().put("products", products))
        }, { call.reject("Google Play could not load the credit packs.", "products_unavailable") })
    }

    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId").orEmpty()
        if (productId.isEmpty()) {
            call.reject("A product is required.", "missing_product")
            return
        }
        // Ties the purchase to the signed-in KunThai account; the server only
        // credits the account whose id matches.
        val accountId = call.getString("obfuscatedAccountId").orEmpty()
        if (accountId.isEmpty()) {
            call.reject("Sign in to buy Visibility Credits.", "missing_account")
            return
        }
        if (purchaseCall != null) {
            call.reject("A purchase is already in progress.", "purchase_in_progress")
            return
        }
        queryProductDetails(listOf(productId), { details ->
            val product = details.firstOrNull { it.productId == productId }
            if (product == null) {
                call.reject("This credit pack is not available.", "product_unavailable")
                return@queryProductDetails
            }
            val productParams = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
            product.oneTimePurchaseOfferDetails?.offerToken?.takeIf { it.isNotEmpty() }?.let { productParams.setOfferToken(it) }
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(productParams.build()))
                .setObfuscatedAccountId(accountId)
                .build()
            activity.runOnUiThread {
                purchaseCall = call
                purchaseProductId = productId
                val result = billingClient.launchBillingFlow(activity, flowParams)
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    // The sheet never opened; onPurchasesUpdated is not called.
                    purchaseCall = null
                    purchaseProductId = null
                    finishPurchaseCall(call, productId, result, null)
                }
            }
        }, { call.reject("This credit pack is not available.", "product_unavailable") })
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        val call = purchaseCall
        val productId = purchaseProductId
        purchaseCall = null
        purchaseProductId = null
        val mine = purchases?.firstOrNull { productId != null && it.products.contains(productId) }
        // Anything else Google Play delivers here is still credited through the event.
        purchases?.filter { it !== mine }?.forEach { notifyListeners("purchase", payload(it), true) }
        if (call == null || productId == null) {
            mine?.let { notifyListeners("purchase", payload(it), true) }
            return
        }
        finishPurchaseCall(call, productId, result, mine)
    }

    private fun finishPurchaseCall(call: PluginCall, productId: String, result: BillingResult, purchase: Purchase?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (purchase == null) {
                    call.reject("Google Play did not confirm this purchase.", "not_confirmed")
                    return
                }
                val response = payload(purchase)
                response.put("status", if (purchase.purchaseState == Purchase.PurchaseState.PENDING) "pending" else "purchased")
                call.resolve(response)
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> call.resolve(JSObject().put("status", "cancelled"))
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                // An earlier purchase of this pack was paid but not credited yet:
                // hand it back so it is credited now.
                queryPurchases({ owned ->
                    val earlier = owned.firstOrNull { it.products.contains(productId) }
                    if (earlier == null) {
                        call.reject("The purchase could not be completed.", "purchase_failed")
                    } else {
                        val response = payload(earlier)
                        response.put("status", if (earlier.purchaseState == Purchase.PurchaseState.PENDING) "pending" else "purchased")
                        call.resolve(response)
                    }
                }, { call.reject("The purchase could not be completed.", "purchase_failed") })
            }
            else -> call.reject("The purchase could not be completed.", "purchase_failed")
        }
    }

    // Called only after KunThai's server has added the credits.
    @PluginMethod
    fun consume(call: PluginCall) {
        val token = call.getString("purchaseToken").orEmpty()
        if (token.isEmpty()) {
            call.reject("A purchase is required.", "missing_purchase")
            return
        }
        val params = ConsumeParams.newBuilder().setPurchaseToken(token).build()
        whenConnected({
            billingClient.consumeAsync(params) { result, _ ->
                // ITEM_NOT_OWNED: already consumed by an earlier attempt.
                call.resolve(JSObject().put("consumed", result.responseCode == BillingClient.BillingResponseCode.OK))
            }
        }, { call.reject("Google Play is not available.", "billing_unavailable") })
    }

    // Paid but not yet credited (app closed or offline at the time), and
    // pending payments (purchaseState "pending"), which are not credited yet.
    @PluginMethod
    fun pendingPurchases(call: PluginCall) {
        queryPurchases({ purchases ->
            val items = JSArray()
            purchases.forEach { items.put(payload(it)) }
            call.resolve(JSObject().put("purchases", items))
        }, { call.reject("Google Play is not available.", "billing_unavailable") })
    }
}
