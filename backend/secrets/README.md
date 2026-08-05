# Firebase Admin SDK (FCM push)

1. Open https://console.firebase.google.com/project/safexchange-f6fe9/settings/serviceaccounts/adminsdk
2. Click **Generate new private key** → download JSON
3. Save the file here as:

   `backend/secrets/firebase-adminsdk.json`

4. Restart backend (`nodemon`)
5. You should see: `[fcm] Firebase Admin messaging ready`
6. Open Android admin app → login (registers FCM token)
7. Test:

   `POST /api/admin/notifications/test-push` (admin JWT required)

Or check: `GET /api/admin/notifications/fcm-status`
