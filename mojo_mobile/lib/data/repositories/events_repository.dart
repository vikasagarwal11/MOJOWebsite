import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../models/mojo_event.dart';

class EventsRepository {
  EventsRepository(this._db);

  final FirebaseFirestore _db;

  /// Upcoming public / members / truly_public events (merged), sorted by [MojoEvent.startAt].
  Stream<List<MojoEvent>> watchUpcoming() {
    final now = Timestamp.fromDate(DateTime.now());
    final base = _db.collection('events');

    final s1 = base
        .where('visibility', isEqualTo: 'public')
        .where('startAt', isGreaterThanOrEqualTo: now)
        .orderBy('startAt')
        .snapshots();

    final s2 = base
        .where('visibility', isEqualTo: 'truly_public')
        .where('startAt', isGreaterThanOrEqualTo: now)
        .orderBy('startAt')
        .snapshots();

    final s3 = base
        .where('visibility', isEqualTo: 'members')
        .where('startAt', isGreaterThanOrEqualTo: now)
        .orderBy('startAt')
        .snapshots();

    return Rx.combineLatest3<QuerySnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>,
        QuerySnapshot<Map<String, dynamic>>,
        List<MojoEvent>>(
      s1,
      s2,
      s3,
      (a, b, c) => _mergeAndSort([a, b, c]),
    );
  }

  List<MojoEvent> _mergeAndSort(List<QuerySnapshot<Map<String, dynamic>>> snaps) {
    final map = <String, MojoEvent>{};
    for (final snap in snaps) {
      for (final doc in snap.docs) {
        map[doc.id] = MojoEvent.fromDoc(doc);
      }
    }
    final list = map.values.toList()
      ..sort((x, y) => x.startAt.compareTo(y.startAt));
    return list;
  }
}
