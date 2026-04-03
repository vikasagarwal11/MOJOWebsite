package com.mfm.mfmdev

import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // flutter_stripe checks ThemeEnforcement.isAppCompatTheme(activity) when attaching.
        // The manifest uses LaunchTheme for the splash window; apply NormalTheme (MaterialComponents)
        // before super.onCreate so the Activity's theme resolves for that check.
        setTheme(R.style.NormalTheme)
        super.onCreate(savedInstanceState)
    }
}
