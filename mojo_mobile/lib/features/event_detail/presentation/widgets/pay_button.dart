import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class PayButton extends StatelessWidget {
  const PayButton({
    super.key,
    required this.onPressed,
    required this.isProcessing,
    required this.isSuccess,
    required this.label,
  });

  final VoidCallback? onPressed;
  final bool isProcessing;
  final bool isSuccess;
  final String label;

  @override
  Widget build(BuildContext context) {
    final disabled = isProcessing || isSuccess;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: LinearGradient(
          colors: disabled
              ? <Color>[const Color(0xFFE2D6CA), const Color(0xFFE2D6CA)]
              : <Color>[const Color(0xFFFF4D1C), const Color(0xFFFF7A4D)],
        ),
      ),
      child: ElevatedButton(
        onPressed: disabled ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          disabledBackgroundColor: Colors.transparent,
          minimumSize: const Size.fromHeight(46),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: isProcessing
            ? const SizedBox(
                height: 18,
                width: 18,
                child: AppLoadingIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  if (isSuccess)
                    const Icon(Icons.check_circle_rounded,
                        color: Color(0xFF22C55E)),
                  if (isSuccess) const SizedBox(width: 8),
                  Text(
                    isSuccess ? 'Paid' : label,
                    style: GoogleFonts.plusJakartaSans(
                      color: disabled ? const Color(0xFF8A776C) : Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}



