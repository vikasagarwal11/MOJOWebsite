import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/entities/event_entity.dart';

class InfoChipsRow extends StatelessWidget {
  const InfoChipsRow({super.key, required this.event});

  final EventEntity event;

  Future<_LatLng?> _resolveCoordinates() async {
    final apiKey = (dotenv.env['GOOGLE_MAPS_API_KEY'] ??
            dotenv.env['GOOGLE_API_KEY'] ??
            dotenv.env['MAPS_API_KEY'] ??
            '')
        .trim();
    if (apiKey.isEmpty || event.location.trim().isEmpty) return null;

    try {
      final uri = Uri.https(
        'maps.googleapis.com',
        '/maps/api/geocode/json',
        <String, String>{
          'address': event.location.trim(),
          'key': apiKey,
        },
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (body['status'] != 'OK') return null;

      final results = body['results'];
      if (results is! List || results.isEmpty) return null;

      final first = results.first;
      if (first is! Map<String, dynamic>) return null;

      final geometry = first['geometry'];
      if (geometry is! Map<String, dynamic>) return null;

      final location = geometry['location'];
      if (location is! Map<String, dynamic>) return null;

      final lat = location['lat'];
      final lng = location['lng'];
      if (lat is! num || lng is! num) return null;

      return _LatLng(lat.toDouble(), lng.toDouble());
    } catch (_) {
      return null;
    }
  }

  Future<void> _openDirections(BuildContext context) async {
    final coords = await _resolveCoordinates();
    final Uri url;

    if (coords != null) {
      url = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}',
      );
    } else {
      final encoded = Uri.encodeComponent(event.location);
      url = Uri.parse('https://www.google.com/maps/search/?api=1&query=$encoded');
    }

    final launched = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open maps.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final locationMax = (width - 32).clamp(220.0, 420.0).toDouble();

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              _InfoChip(
                icon: Icons.calendar_month_rounded,
                label: 'Date',
                value: DateFormat('EEE, MMM d').format(event.startAt),
                minWidth: 98,
                maxWidth: 148,
              ),
              _InfoChip(
                icon: Icons.schedule_rounded,
                label: 'Time',
                value: DateFormat('h:mm a').format(event.startAt),
                minWidth: 92,
                maxWidth: 138,
              ),
              _InfoChip(
                icon: Icons.place_outlined,
                label: 'Location',
                value: event.location,
                minWidth: 180,
                maxWidth: locationMax,
                maxLines: 2,
                onTap: () => _openDirections(context),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.icon,
    required this.label,
    required this.value,
    required this.minWidth,
    required this.maxWidth,
    this.maxLines = 1,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final double minWidth;
  final double maxWidth;
  final int maxLines;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final child = Container(
      constraints: BoxConstraints(minWidth: minWidth, maxWidth: maxWidth),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, color: const Color(0xFFD95A2B), size: 17),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  label,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10,
                    color: const Color(0xFF8B7468),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  value,
                  maxLines: maxLines,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12.5,
                    color: const Color(0xFF2E231E),
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    return onTap == null
        ? child
        : InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(18),
            child: child,
          );
  }
}

class _LatLng {
  const _LatLng(this.lat, this.lng);

  final double lat;
  final double lng;
}

