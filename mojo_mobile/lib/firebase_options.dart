// Web: momsfitnessmojo-dev. Android: com.mfm.mfmdev (google-services.json). iOS: update when you add a dev iOS app.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyCUCw31tvQAdhODTqSddJVqKZXqzaDB6gQ',
    appId: '1:459380776372:web:803e2580a1c127cc9ba6e1',
    messagingSenderId: '459380776372',
    projectId: 'momsfitnessmojo-dev',
    authDomain: 'momsfitnessmojo-dev.firebaseapp.com',
    storageBucket: 'momsfitnessmojo-dev.firebasestorage.app',
    measurementId: 'G-PXJEL9PXZH',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyAGrzggEPyV24Dr04X9829Mn3QR2fQLrQU',
    appId: '1:459380776372:android:8ff171bb879a7ca89ba6e1',
    messagingSenderId: '459380776372',
    projectId: 'momsfitnessmojo-dev',
    storageBucket: 'momsfitnessmojo-dev.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyBY8E5W-2N7TRiRNn-WQ6eXa21a-qabiSE',
    appId: '1:313384637691:ios:c8cdf387f3c5ea43634c5e',
    messagingSenderId: '313384637691',
    projectId: 'momsfitnessmojo-65d00',
    storageBucket: 'momsfitnessmojo-65d00.firebasestorage.app',
    iosBundleId: 'com.momfitnessmojo.mojoMobile',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'REPLACE_ME',
    appId: '1:000000000000:ios:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'momsfitnessmojo-dev',
    storageBucket: 'momsfitnessmojo-dev.firebasestorage.app',
    iosBundleId: 'com.momfitnessmojo.mojoMobile',
  );
}

bool get firebaseOptionsConfigured {
  return !DefaultFirebaseOptions.android.apiKey.contains('REPLACE_ME');
}