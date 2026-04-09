import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:google_fonts/google_fonts.dart';

import '../bloc/event_detail_bloc.dart';

class CollapsibleDescription extends StatelessWidget {
  const CollapsibleDescription({super.key});

  static const int _previewChars = 220;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<EventDetailBloc, EventDetailState>(
      buildWhen: (previous, current) =>
          current is EventDetailLoaded &&
          (previous is! EventDetailLoaded ||
              previous.isDescriptionExpanded != current.isDescriptionExpanded ||
              previous.event.description != current.event.description),
      builder: (context, state) {
        if (state is! EventDetailLoaded) return const SizedBox.shrink();

        final text = state.event.description.trim();
        if (text.isEmpty) return const SizedBox.shrink();

        final content = state.isDescriptionExpanded ? text : _previewMarkdown(text);

        return Container(
          margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          padding: const EdgeInsets.all(14),
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'About Event',
                style: GoogleFonts.manrope(
                  color: const Color(0xFF2E231E),
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 10),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 260),
                child: MarkdownBody(
                  key: ValueKey<bool>(state.isDescriptionExpanded),
                  data: content,
                  selectable: true,
                  styleSheet: _markdownStyle(),
                ),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => context
                      .read<EventDetailBloc>()
                      .add(const ToggleDescription()),
                  child: Text(
                    state.isDescriptionExpanded ? 'Show less' : 'Read more',
                    style: GoogleFonts.plusJakartaSans(
                      color: const Color(0xFFD95A2B),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _previewMarkdown(String value) {
    if (value.length <= _previewChars) return value;
    final preview = value.substring(0, _previewChars);
    final lastSpace = preview.lastIndexOf(' ');
    final safe = lastSpace > 0 ? preview.substring(0, lastSpace) : preview;
    return '$safe...';
  }

  static MarkdownStyleSheet _markdownStyle() {
    final bodyStyle = GoogleFonts.plusJakartaSans(
      color: const Color(0xFF4A3A33),
      fontSize: 14,
      height: 1.45,
    );
    return MarkdownStyleSheet(
      p: bodyStyle,
      h1: GoogleFonts.manrope(
        color: const Color(0xFF2E231E),
        fontWeight: FontWeight.w700,
      ),
      h2: GoogleFonts.manrope(
        color: const Color(0xFF2E231E),
        fontWeight: FontWeight.w700,
      ),
      h3: GoogleFonts.manrope(
        color: const Color(0xFF2E231E),
        fontWeight: FontWeight.w700,
      ),
      listBullet: bodyStyle,
      strong: bodyStyle.copyWith(fontWeight: FontWeight.w700),
      em: bodyStyle.copyWith(fontStyle: FontStyle.italic),
      blockquote: bodyStyle.copyWith(color: const Color(0xFF6A5448)),
      blockquoteDecoration: BoxDecoration(
        color: const Color(0xFFF5ECE2),
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}

