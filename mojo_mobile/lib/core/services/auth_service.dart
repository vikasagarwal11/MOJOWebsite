import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:logger/logger.dart';

/// Phone-first auth aligned with web ([Login.tsx], [AuthContext]): callable check, SMS OTP, Firestore user doc gate on login.
class AuthService {
  AuthService(this._auth, this._firestore, this._functions);

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  final Logger _log = Logger();

  Stream<User?> get authStateChanges => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  /// Callable [checkPhoneNumberExists] first; on failure, Firestore [users] where `phoneNumber` matches (same as web fallback).
  Future<bool> checkPhoneNumberRegistered(String e164Phone) async {
    try {
      final callable = _functions.httpsCallable('checkPhoneNumberExists');
      final result = await callable.call(<String, dynamic>{'phoneNumber': e164Phone});
      final data = result.data;
      if (data is Map) {
        if (data['exists'] == true) return true;
        if (data['exists'] == false) return false;
      }
    } catch (e, st) {
      _log.w('checkPhoneNumberExists failed, using Firestore fallback', error: e, stackTrace: st);
    }
    try {
      final q = await _firestore
          .collection('users')
          .where('phoneNumber', isEqualTo: e164Phone)
          .limit(1)
          .get();
      return q.docs.isNotEmpty;
    } catch (e, st) {
      _log.e('Firestore phone lookup failed', error: e, stackTrace: st);
      return false;
    }
  }

  /// Sends SMS; [codeSent] receives Firebase [verificationId] for [PhoneAuthProvider.credential].
  Future<void> startPhoneVerification({
    required String e164Phone,
    required void Function(String verificationId, int? resendToken) codeSent,
    required void Function(FirebaseAuthException e) verificationFailed,
    Future<void> Function(PhoneAuthCredential credential)? verificationCompleted,
  }) async {
    await _auth.verifyPhoneNumber(
      phoneNumber: e164Phone,
      timeout: const Duration(seconds: 120),
      verificationCompleted: (PhoneAuthCredential credential) async {
        if (verificationCompleted != null) {
          await verificationCompleted(credential);
        }
      },
      verificationFailed: verificationFailed,
      codeSent: codeSent,
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  /// Sign in with OTP. When [requireUserDocument] is true (login), signs out if `users/{uid}` is missing (web parity).
  Future<UserCredential> signInWithSmsCode({
    required String verificationId,
    required String smsCode,
    bool requireUserDocument = true,
  }) async {
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode.trim(),
    );
    return signInWithPhoneCredential(credential, requireUserDocument: requireUserDocument);
  }

  Future<UserCredential> signInWithPhoneCredential(
    PhoneAuthCredential credential, {
    bool requireUserDocument = true,
  }) async {
    final cred = await _auth.signInWithCredential(credential);
    if (!requireUserDocument) return cred;

    final uid = cred.user?.uid;
    if (uid == null) {
      await _auth.signOut();
      throw FirebaseAuthException(
        code: 'invalid-user',
        message: 'Sign-in failed.',
      );
    }

    final snap = await _firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      await _auth.signOut();
      throw FirebaseAuthException(
        code: 'user-doc-missing',
        message: 'No account found. Please register first.',
      );
    }
    return cred;
  }

  Future<void> signOut() => _auth.signOut();
}
