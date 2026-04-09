import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qr_flutter/qr_flutter.dart';

class QrCodeTab extends StatelessWidget {
  const QrCodeTab({super.key, required this.data});

  final String data;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size.width;
    final qrSize = (size - 128).clamp(176.0, 248.0);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFCF8),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFEADBCB)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: <Widget>[
          Text(
            'Scan At Entry',
            style: GoogleFonts.manrope(
              color: const Color(0xFF2D231F),
              fontWeight: FontWeight.w700,
              fontSize: 17,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Show this QR code at check-in',
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              color: const Color(0xFF7D665A),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFEADBCB)),
            ),
            padding: const EdgeInsets.all(12),
            child: QrImageView(data: data, size: qrSize),
          ),
        ],
      ),
    );
  }
}

