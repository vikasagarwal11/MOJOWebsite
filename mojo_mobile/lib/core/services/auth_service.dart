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

  /// Firestore `users/{uid}.status` after sign-in (web pending-approval parity).
  Future<String?> getUserProfileStatus(String uid) async {
    final snap = await _firestore.collection('users').doc(uid).get();
    return snap.data()?['status'] as String?;
  }

  /// Creates pending user + `accountApprovals` row like web [AuthContext.createPendingUser] + [AccountApprovalService].
  Future<void> createPendingUser({
    required String userId,
    required String firstName,
    required String lastName,
    required String email,
    required String phoneNumber,
    required String location,
    required String howDidYouHear,
    String? howDidYouHearOther,
    String? referredBy,
    String? referralNotes,
  }) async {
    final docRef = _firestore.collection('users').doc(userId);
    final displayName = '$firstName $lastName'.trim();
    final snap = await docRef.get();

    if (snap.exists) {
      // Reapplication — web sets status back to pending; rules may block `status` for self-serve updates.
      final reapplied = <String, dynamic>{
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'displayName': displayName,
        'phoneNumber': phoneNumber,
        'status': 'pending',
        'approvalRequestedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
        'smsConsentGiven': true,
        'smsConsentVersion': 'v1',
        'smsConsentSource': 'register_phone_verification',
        'smsConsentLastConfirmedAt': FieldValue.serverTimestamp(),
      };
      try {
        await docRef.update(reapplied);
      } catch (e, st) {
        _log.w('Reapplication update without status (permission or rules)', error: e, stackTrace: st);
        reapplied.remove('status');
        await docRef.update(reapplied);
      }
    } else {
      await docRef.set({
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'displayName': displayName,
        'phoneNumber': phoneNumber,
        'role': 'member',
        'status': 'pending',
        'blockedFromRsvp': false,
        'approvalRequestedAt': FieldValue.serverTimestamp(),
        'smsConsentGiven': true,
        'smsConsentVersion': 'v1',
        'smsConsentSource': 'register_phone_verification',
        'smsConsentGivenAt': FieldValue.serverTimestamp(),
        'smsConsentLastConfirmedAt': FieldValue.serverTimestamp(),
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }

    final approvalRef = _firestore.collection('accountApprovals').doc();
    final approvalData = <String, dynamic>{
      'userId': userId,
      'firstName': firstName,
      'lastName': lastName,
      'email': email,
      'phoneNumber': phoneNumber,
      'status': 'pending',
      'submittedAt': FieldValue.serverTimestamp(),
      'awaitingResponseFrom': null,
      'unreadCount': <String, int>{'admin': 0, 'user': 0},
    };
    if (location.isNotEmpty) approvalData['location'] = location;
    if (howDidYouHear.isNotEmpty) approvalData['howDidYouHear'] = howDidYouHear;
    if (howDidYouHearOther != null && howDidYouHearOther.isNotEmpty) {
      approvalData['howDidYouHearOther'] = howDidYouHearOther;
    }
    if (referredBy != null && referredBy.isNotEmpty) approvalData['referredBy'] = referredBy;
    if (referralNotes != null && referralNotes.isNotEmpty) approvalData['referralNotes'] = referralNotes;
    await approvalRef.set(approvalData);

    await _notifyAdminsNewApprovalRequest(
      adminMessage: '$firstName $lastName has requested account approval.',
      relatedApprovalId: approvalRef.id,
    );
  }

  Future<void> _notifyAdminsNewApprovalRequest({
    required String adminMessage,
    required String relatedApprovalId,
  }) async {
    try {
      final admins = await _firestore.collection('users').where('role', isEqualTo: 'admin').limit(25).get();
      for (final d in admins.docs) {
        try {
          await _firestore.collection('notifications').add({
            'userId': d.id,
            'type': 'general',
            'title': 'New account approval request',
            'message': adminMessage,
            'read': false,
            'createdAt': FieldValue.serverTimestamp(),
            'expiresAt': null,
            'metadata': {'relatedId': relatedApprovalId, 'relatedType': 'approval'},
          });
        } catch (e, st) {
          _log.w('Admin notification skipped for ${d.id}', error: e, stackTrace: st);
        }
      }
    } catch (e, st) {
      _log.w('notifyAdminsNewApprovalRequest failed (non-blocking)', error: e, stackTrace: st);
    }
  }

  Future<void> signOut() => _auth.signOut();
}
