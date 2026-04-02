/// Maps Firestore / gRPC errors to short, user-facing copy (no stack traces).
String userFacingFirestoreMessage(Object? error) {
  if (error == null) {
    return 'Something went wrong. Pull to refresh or try again in a moment.';
  }
  final s = error.toString().toLowerCase();

  if (_looksLikeConnectivityError(s)) {
    return "Can't reach MOJO servers. Check Wi‑Fi or mobile data, try turning off VPN, "
        'or switch networks (emulators: cold boot AVD if DNS fails).';
  }

  if (s.contains('permission-denied')) {
    return 'Access was denied. Stay signed in, ensure your account is approved, '
        'and ask an admin that Firestore rules are deployed for this app.';
  }

  if (s.contains('failed-precondition') && s.contains('index')) {
    return 'This list needs a Firestore index. Developers: deploy indexes from the repo '
        'or use the link in the debug console.';
  }

  if (s.contains('unauthenticated') || s.contains('not signed in')) {
    return 'Please sign in again, then retry.';
  }

  return 'Something went wrong. Pull to refresh or try again in a moment.';
}

bool _looksLikeConnectivityError(String s) {
  return s.contains('unavailable') ||
      s.contains('unknownhost') ||
      s.contains('unknown host') ||
      s.contains('eai_nodata') ||
      s.contains('no address associated with hostname') ||
      s.contains('unable to resolve host') ||
      s.contains('network is unreachable') ||
      s.contains('connection refused') ||
      s.contains('connection reset') ||
      s.contains('connection timed out') ||
      s.contains('host lookup failed') ||
      s.contains('failed host lookup') ||
      (s.contains('socketexception') && s.contains('failed')) ||
      (s.contains('grpc') && s.contains('unavailable'));
}
