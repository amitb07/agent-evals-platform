# Deploying Ledgerline

Every merge to `main` builds an image and deploys it to **staging** automatically through GitHub
Actions.

Production deploys are manual: run the `promote` workflow with the release tag. We promote to
production only on Tuesdays and Thursdays, before 15:00 Berlin time.

Database migrations run before the new version starts and must be backwards compatible with the
previous release.

To roll back, run `ledgerctl rollback <release-tag>`; it redeploys the previous image but does
not undo migrations.
