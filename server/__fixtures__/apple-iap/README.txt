TEST-ONLY certificates and keys for server/appleIap.test.js.
They imitate the shape of Apple's StoreKit signing chain. They are not Apple's,
sign nothing real, and can never pass production verification (which pins
Apple Root CA - G3). Regenerate with openssl using ext.cnf if needed.
