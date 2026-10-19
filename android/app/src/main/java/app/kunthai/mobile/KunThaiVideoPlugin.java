package app.kunthai.mobile;

import android.content.Context;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.media3.common.Effect;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.EditedMediaItemSequence;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.InAppMuxer;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Prepares a picked video for upload (Explore Swip/UrFeed, UrMall): keeps only
 * the chosen trim window and re-encodes it with the phone's hardware encoder as
 * H.264/AAC MP4 at up to 1080p and ~5 Mbps with the index at the front, so it
 * streams at once. On a phone screen this looks the same as the camera original
 * (often 25+ Mbps). HDR is tone-mapped to standard colour. A video already at
 * or under these limits is left as it is. Same API as the iOS plugin
 * (ios/App/App/VideoCompressionPlugin.swift); JS side:
 * src/Backend/services/media/nativeVideoCompression.js.
 *
 * A video picked through the web file picker is read where it is (usePicked,
 * see KunThaiChromeClient); otherwise JS copies the File in (beginFile /
 * appendFile).
 */
@CapacitorPlugin(name = "KunThaiVideo")
public class KunThaiVideoPlugin extends Plugin {
    private final Map<String, File> inputs = new ConcurrentHashMap<>();
    private final Map<String, Uri> pickedInputs = new ConcurrentHashMap<>();
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private static final class Picked {
        final Uri uri;
        final String name;
        final long size;

        Picked(Uri uri, String name, long size) {
            this.uri = uri;
            this.name = name;
            this.size = size;
        }
    }

    private static final List<Picked> recentlyPicked = Collections.synchronizedList(new ArrayList<>());

    /** Called by KunThaiChromeClient with what the file picker returned. */
    static void rememberPicked(Context context, Uri[] uris) {
        if (uris == null || context == null) return;
        for (Uri uri : uris) {
            if (uri == null) continue;
            String name = "";
            long size = -1;
            try (Cursor cursor = context.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                    if (nameIndex >= 0) name = cursor.getString(nameIndex);
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
                }
            } catch (Exception ignored) {
                // Not a queryable content Uri (e.g. a camera file): try the path.
            }
            if (size < 0 && "file".equals(uri.getScheme()) && uri.getPath() != null) {
                File file = new File(uri.getPath());
                name = file.getName();
                size = file.length();
            }
            if (size < 0) continue;
            recentlyPicked.add(0, new Picked(uri, name == null ? "" : name, size));
            while (recentlyPicked.size() > 12) recentlyPicked.remove(recentlyPicked.size() - 1);
        }
    }

    private File workDirectory() {
        File dir = new File(getContext().getCacheDir(), "kt-video");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    /** { id } for a picked video matching the page's File (name and size), or no id. */
    @PluginMethod
    public void usePicked(PluginCall call) {
        String name = call.getString("name", "");
        Double rawSize = call.getDouble("size", -1.0);
        long size = rawSize == null ? -1 : rawSize.longValue();
        JSObject result = new JSObject();
        synchronized (recentlyPicked) {
            for (Picked picked : recentlyPicked) {
                if (picked.size == size && (name == null || name.isEmpty() || picked.name.isEmpty() || picked.name.equals(name))) {
                    String id = UUID.randomUUID().toString();
                    pickedInputs.put(id, picked.uri);
                    result.put("id", id);
                    break;
                }
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void beginFile(PluginCall call) {
        io.execute(() -> {
            try {
                String name = call.getString("name", "video.mp4");
                String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "mp4";
                if (!ext.matches("mp4|mov|m4v|3gp|webm|mkv")) ext = "mp4";
                String id = UUID.randomUUID().toString();
                File file = new File(workDirectory(), "in-" + id + "." + ext);
                if (!file.exists() && !file.createNewFile()) throw new IllegalStateException("create");
                inputs.put(id, file);
                JSObject result = new JSObject();
                result.put("id", id);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not prepare the video.");
            }
        });
    }

    @PluginMethod
    public void appendFile(PluginCall call) {
        io.execute(() -> {
            String id = call.getString("id");
            File file = id == null ? null : inputs.get(id);
            String data = call.getString("data");
            if (file == null || data == null) {
                call.reject("Video chunk was not readable.");
                return;
            }
            try (FileOutputStream out = new FileOutputStream(file, true)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not copy the video.");
            }
        });
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        io.execute(() -> {
            String path = call.getString("path");
            if (path != null) {
                File file = new File(path);
                if (file.getAbsolutePath().startsWith(workDirectory().getAbsolutePath())) {
                    //noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
            }
            call.resolve();
        });
    }

    private static int even(double value) {
        return Math.max(2, (int) Math.round(value / 2.0) * 2);
    }

    private static long readLong(MediaMetadataRetriever retriever, int key) {
        try {
            String value = retriever.extractMetadata(key);
            return value == null ? 0 : Long.parseLong(value);
        } catch (Exception error) {
            return 0;
        }
    }

    private long sourceBytes(Uri source, File copied) {
        if (copied != null) return copied.length();
        try (Cursor cursor = getContext().getContentResolver().query(source, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {
            // Unknown size.
        }
        return 0;
    }

    /** Copied inputs are temporary; picked videos belong to the person and are never deleted. */
    private static void discard(File copied) {
        //noinspection ResultOfMethodCallIgnored
        if (copied != null) copied.delete();
    }

    @PluginMethod
    public void compress(PluginCall call) {
        String id = call.getString("id");
        Uri pickedUri = id == null ? null : pickedInputs.remove(id);
        File copied = id == null ? null : inputs.remove(id);
        if (copied == null && pickedUri == null) {
            call.reject("Video was not copied.");
            return;
        }
        final File input = copied;
        final Uri source = pickedUri != null ? pickedUri : Uri.fromFile(copied);
        int maxShortSide = call.getInt("maxShortSide", 1080);
        int videoBitrate = call.getInt("videoBitrate", 5_000_000);
        Double startValue = call.getDouble("startSeconds", 0.0);
        double requestedStart = startValue == null ? 0 : startValue;
        Double requestedEnd = call.getDouble("endSeconds");

        io.execute(() -> {
            long durationMs;
            int width;
            int height;
            int rotation;
            long bitrate;
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                if (input != null) retriever.setDataSource(input.getAbsolutePath());
                else retriever.setDataSource(getContext(), source);
                durationMs = readLong(retriever, MediaMetadataRetriever.METADATA_KEY_DURATION);
                width = (int) readLong(retriever, MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                height = (int) readLong(retriever, MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                rotation = (int) readLong(retriever, MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                bitrate = readLong(retriever, MediaMetadataRetriever.METADATA_KEY_BITRATE);
            } catch (Exception error) {
                discard(input);
                call.reject("Video could not be read.");
                return;
            } finally {
                try {
                    retriever.release();
                } catch (Exception ignored) {
                    // Nothing to release.
                }
            }

            double duration = durationMs / 1000.0;
            double start = Math.max(0, Math.min(requestedStart, Math.max(0, duration - 0.1)));
            double end = Math.min(duration, Math.max(start + 0.5, requestedEnd == null ? duration : requestedEnd));
            boolean trimmed = start > 0.05 || end < duration - 0.05;
            int shortSide = Math.min(width, height);
            boolean scaleDown = shortSide > maxShortSide;
            long bytes = sourceBytes(source, input);
            long totalBitrate = bitrate > 0 ? bitrate : (duration > 0 ? (long) (bytes * 8 / duration) : 0);

            // Already light enough and nothing to cut: upload the original untouched.
            if (!trimmed && !scaleDown && totalBitrate > 0 && totalBitrate <= videoBitrate * 1.3) {
                discard(input);
                JSObject result = new JSObject();
                result.put("skipped", true);
                result.put("bytes", bytes);
                result.put("durationSeconds", duration);
                call.resolve(result);
                return;
            }

            File output = new File(workDirectory(), "out-" + id + ".mp4");
            //noinspection ResultOfMethodCallIgnored
            output.delete();
            double clipSeconds = end - start;
            // Frames reach effects upright, so size the upright picture.
            boolean sideways = rotation == 90 || rotation == 270;
            int uprightWidth = sideways ? height : width;
            int uprightHeight = sideways ? width : height;
            double scale = scaleDown ? (double) maxShortSide / shortSide : 1.0;
            int outWidth = scaleDown ? even(uprightWidth * scale) : 0;
            int outHeight = scaleDown ? even(uprightHeight * scale) : 0;

            // Transformer must be built and run on a thread with a Looper.
            main.post(() -> startExport(call, id, input, source, output, start, end, clipSeconds, trimmed, outWidth, outHeight, videoBitrate));
        });
    }

    private void startExport(PluginCall call, String id, File input, Uri source, File output, double start, double end,
                             double clipSeconds, boolean trimmed, int outWidth, int outHeight, int videoBitrate) {
        try {
            MediaItem.Builder item = new MediaItem.Builder().setUri(source);
            if (trimmed) {
                item.setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs((long) (start * 1000))
                    .setEndPositionMs((long) (end * 1000))
                    .build());
            }
            List<Effect> videoEffects = new ArrayList<>();
            if (outWidth > 0 && outHeight > 0) {
                videoEffects.add(Presentation.createForWidthAndHeight(outWidth, outHeight, Presentation.LAYOUT_SCALE_TO_FIT));
            }
            EditedMediaItem edited = new EditedMediaItem.Builder(item.build())
                .setEffects(new Effects(Collections.<AudioProcessor>emptyList(), videoEffects))
                .build();
            Composition composition = new Composition.Builder(new EditedMediaItemSequence(edited))
                .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
                .build();

            Transformer transformer = new Transformer.Builder(getContext())
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                // Media3's own MP4 writer puts the index at the front (faststart).
                .setMuxerFactory(new InAppMuxer.Factory.Builder().build())
                .setEncoderFactory(new DefaultEncoderFactory.Builder(getContext())
                    .setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(videoBitrate).build())
                    .setEnableFallback(true)
                    .build())
                .addListener(new Transformer.Listener() {
                    @Override
                    public void onCompleted(@NonNull Composition done, @NonNull ExportResult exportResult) {
                        main.removeCallbacksAndMessages(id);
                        discard(input);
                        notifyProgress(id, 1.0);
                        JSObject result = new JSObject();
                        result.put("skipped", false);
                        result.put("path", output.getAbsolutePath());
                        result.put("bytes", output.length());
                        result.put("width", exportResult.width);
                        result.put("height", exportResult.height);
                        result.put("durationSeconds", clipSeconds);
                        result.put("trimmed", trimmed);
                        call.resolve(result);
                    }

                    @Override
                    public void onError(@NonNull Composition done, @NonNull ExportResult exportResult, @NonNull ExportException exception) {
                        main.removeCallbacksAndMessages(id);
                        discard(input);
                        //noinspection ResultOfMethodCallIgnored
                        output.delete();
                        call.reject("Video could not be prepared: " + exception.getMessage());
                    }
                })
                .build();

            transformer.start(composition, output.getAbsolutePath());
            pollProgress(transformer, id);
        } catch (Exception error) {
            discard(input);
            call.reject("Video could not be prepared: " + error.getMessage());
        }
    }

    private void pollProgress(Transformer transformer, String id) {
        ProgressHolder holder = new ProgressHolder();
        Runnable tick = new Runnable() {
            @Override
            public void run() {
                int state = transformer.getProgress(holder);
                if (state == Transformer.PROGRESS_STATE_NOT_STARTED) return;
                if (state == Transformer.PROGRESS_STATE_AVAILABLE) notifyProgress(id, holder.progress / 100.0);
                main.postAtTime(this, id, SystemClock.uptimeMillis() + 250);
            }
        };
        main.postAtTime(tick, id, SystemClock.uptimeMillis() + 250);
    }

    private void notifyProgress(String id, double progress) {
        JSObject data = new JSObject();
        data.put("id", id);
        data.put("progress", Math.max(0, Math.min(1, progress)));
        notifyListeners("progress", data);
    }
}
