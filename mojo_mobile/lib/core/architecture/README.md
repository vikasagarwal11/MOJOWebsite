# Clean Architecture + BLoC Migration

This app now supports a feature-first clean architecture with BLoC.

## Layering

- `features/<feature>/data`: Firebase/network models, datasources, repository implementation.
- `features/<feature>/domain`: entities, repository contracts, use cases.
- `features/<feature>/presentation`: BLoC, screens/widgets.

## Migration Rules

1. Keep Firebase calls in `data` only.
2. Keep `presentation` free of Firestore query logic.
3. Expose business flow through a `usecase` class.
4. Drive widget state via BLoC states/events.
5. Migrate feature-by-feature to avoid production regressions.

## First Migrated Vertical

- Stories list (`home/widgets/stories_bar.dart`) is now BLoC + clean architecture based.
- New feature module: `features/stories/...`.

## Next Recommended Migrations

1. Auth (login/register/pending approval)
2. Events listing + detail
3. Posts feed + create flow
4. Media upload flow
