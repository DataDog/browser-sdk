package com.example.webviewtest;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;

/**
 * Minimal WebView activity for E2E testing.
 * Loads a URL passed via intent extra "url", defaulting to about:blank.
 * JavaScript and DOM storage are enabled to allow the SDK to run.
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Required for Playwright to connect to the WebView via Chrome DevTools Protocol
        WebView.setWebContentsDebuggingEnabled(true);

        WebView webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        webView.setWebViewClient(new WebViewClient());

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) {
            url = "about:blank";
        }
        webView.loadUrl(url);
    }
}
