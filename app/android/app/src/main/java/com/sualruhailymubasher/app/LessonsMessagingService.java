package com.albadrmubasher.app;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.RemoteMessage;
import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;

/**
 * Removes the "live now" notification when the server reports the broadcast has ended.
 * The FCM SDK posts a tagged notification under id 0, and this service also runs when the app is killed.
 */
public class LessonsMessagingService extends MessagingService {

    static final String LIVE_TAG = "live";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        if (LIVE_TAG.equals(message.getData().get("dismiss"))) {
            NotificationManagerCompat.from(this).cancel(LIVE_TAG, 0);
            return;
        }
        super.onMessageReceived(message);
    }
}
