import 'package:pedometer/pedometer.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';

final pedometerServiceProvider = Provider((ref) => PedometerService());

class PedometerService {
  Stream<StepCount> get stepCountStream => Pedometer.stepCountStream;
  Stream<PedestrianStatus> get pedestrianStatusStream => Pedometer.pedestrianStatusStream;

  // This would typically save steps to Firestore to award XP
  Future<void> syncStepsToMojoXP(int steps) async {
    // Logic to update user's XP in Firestore
    // e.g., 100 steps = 1 XP
  }
}
