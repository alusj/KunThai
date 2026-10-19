import Foundation
import Capacitor
import AVFoundation
import CoreMedia

// Prepares a picked video for upload (Explore Swip/UrFeed, UrMall): keeps only
// the chosen trim window and re-encodes it as H.264/AAC MP4 at up to 1080p and
// ~5 Mbps with the index at the front (faststart), so it streams at once. On a
// phone screen this looks the same as the camera original (often 25+ Mbps).
// HDR (iPhone Dolby Vision/HLG) is converted to standard colour so it does not
// look washed out. A video already at or under these limits is left as it is.
// Kept inside the App target like KunThaiStoreKitPlugin. JS side:
// src/Backend/services/media/nativeVideoCompression.js.
//
// The WebView hands over a File, which native code cannot open, so JS copies
// it here in chunks (beginFile / appendFile), then calls compress().
@objc(KunThaiVideoPlugin)
public class KunThaiVideoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KunThaiVideoPlugin"
    public let jsName = "KunThaiVideo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "usePicked", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "compress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFile", returnType: CAPPluginReturnPromise),
    ]

    private let queue = DispatchQueue(label: "app.kunthai.video", qos: .userInitiated)
    private var inputs: [String: URL] = [:]

    private var workDirectory: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("kt-video", isDirectory: true)
    }

    // Android reads a picked video in place; WKWebView never exposes where its
    // picked files are, so iOS always copies (beginFile / appendFile).
    @objc func usePicked(_ call: CAPPluginCall) {
        call.resolve([:])
    }

    @objc func beginFile(_ call: CAPPluginCall) {
        queue.async {
            do {
                try FileManager.default.createDirectory(at: self.workDirectory, withIntermediateDirectories: true)
                let name = call.getString("name") ?? "video.mp4"
                let ext = (name as NSString).pathExtension.lowercased()
                let safeExt = ["mp4", "mov", "m4v", "3gp"].contains(ext) ? ext : "mp4"
                let id = UUID().uuidString
                let url = self.workDirectory.appendingPathComponent("in-\(id).\(safeExt)")
                FileManager.default.createFile(atPath: url.path, contents: nil)
                self.inputs[id] = url
                call.resolve(["id": id])
            } catch {
                call.reject("Could not prepare the video.")
            }
        }
    }

    @objc func appendFile(_ call: CAPPluginCall) {
        queue.async {
            guard let id = call.getString("id"), let url = self.inputs[id],
                  let base64 = call.getString("data"), let data = Data(base64Encoded: base64) else {
                call.reject("Video chunk was not readable.")
                return
            }
            do {
                let handle = try FileHandle(forWritingTo: url)
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
                try handle.close()
                call.resolve()
            } catch {
                call.reject("Could not copy the video.")
            }
        }
    }

    @objc func deleteFile(_ call: CAPPluginCall) {
        queue.async {
            if let path = call.getString("path") {
                let url = URL(fileURLWithPath: path)
                if url.path.hasPrefix(self.workDirectory.path) {
                    try? FileManager.default.removeItem(at: url)
                }
            }
            call.resolve()
        }
    }

    @objc func compress(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let input = inputs[id] else {
            call.reject("Video was not copied.")
            return
        }
        let maxShortSide = CGFloat(call.getInt("maxShortSide") ?? 1080)
        let videoBitrate = call.getInt("videoBitrate") ?? 5_000_000
        let requestedStart = call.getDouble("startSeconds") ?? 0
        let requestedEnd = call.getDouble("endSeconds")

        queue.async {
            defer { self.inputs[id] = nil }
            do {
                let result = try self.transcode(
                    id: id,
                    input: input,
                    maxShortSide: maxShortSide,
                    videoBitrate: videoBitrate,
                    requestedStart: requestedStart,
                    requestedEnd: requestedEnd
                )
                call.resolve(result)
            } catch {
                try? FileManager.default.removeItem(at: input)
                call.reject("Video could not be prepared: \(error.localizedDescription)")
            }
        }
    }

    private func even(_ value: CGFloat) -> Int {
        max(2, Int((value / 2).rounded()) * 2)
    }

    private func transcode(id: String, input: URL, maxShortSide: CGFloat, videoBitrate: Int, requestedStart: Double, requestedEnd: Double?) throws -> [String: Any] {
        let asset = AVURLAsset(url: input, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            throw NSError(domain: "KunThaiVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video track"])
        }
        let audioTrack = asset.tracks(withMediaType: .audio).first
        let duration = CMTimeGetSeconds(asset.duration)
        let start = max(0, min(requestedStart, max(0, duration - 0.1)))
        let end = min(duration, max(start + 0.5, requestedEnd ?? duration))
        let trimmed = start > 0.05 || end < duration - 0.05

        let oriented = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
        let width = abs(oriented.width)
        let height = abs(oriented.height)
        let shortSide = min(width, height)
        let scale = shortSide > maxShortSide ? maxShortSide / shortSide : 1
        let outWidth = even(width * scale)
        let outHeight = even(height * scale)
        let sourceBitrate = Double(videoTrack.estimatedDataRate)
        let fileBytes = (try? FileManager.default.attributesOfItem(atPath: input.path)[.size] as? NSNumber)?.int64Value ?? 0

        // Already light enough and nothing to cut: upload the original untouched.
        if !trimmed && scale >= 1 && sourceBitrate > 0 && sourceBitrate <= Double(videoBitrate) * 1.3 {
            try? FileManager.default.removeItem(at: input)
            return ["skipped": true, "bytes": fileBytes, "durationSeconds": duration]
        }

        let output = workDirectory.appendingPathComponent("out-\(id).mp4")
        try? FileManager.default.removeItem(at: output)

        let timeRange = CMTimeRange(
            start: CMTime(seconds: start, preferredTimescale: 600),
            end: CMTime(seconds: end, preferredTimescale: 600)
        )
        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = timeRange

        let fps = videoTrack.nominalFrameRate > 0 ? min(60, videoTrack.nominalFrameRate) : 30
        let composition = AVMutableVideoComposition()
        composition.renderSize = CGSize(width: outWidth, height: outHeight)
        composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
        // Standard (SDR) colour out, whatever came in.
        composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
        composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
        composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        // Upright, then moved so the picture starts at the top-left corner:
        // some files (often from Android) rotate without that offset, which
        // would draw every frame off the canvas (black video).
        let rotation = videoTrack.preferredTransform
        let placed = CGRect(origin: .zero, size: videoTrack.naturalSize).applying(rotation)
        let upright = rotation.concatenating(CGAffineTransform(translationX: -placed.minX, y: -placed.minY))
        layer.setTransform(upright.concatenating(CGAffineTransform(scaleX: scale, y: scale)), at: .zero)
        instruction.layerInstructions = [layer]
        composition.instructions = [instruction]

        let videoOutput = AVAssetReaderVideoCompositionOutput(
            videoTracks: [videoTrack],
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
        )
        videoOutput.videoComposition = composition
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw NSError(domain: "KunThaiVideo", code: 2) }
        reader.add(videoOutput)

        var audioOutput: AVAssetReaderTrackOutput?
        var channels = 2
        var sampleRate = 44_100.0
        if let audioTrack {
            if let description = audioTrack.formatDescriptions.first,
               let basic = CMAudioFormatDescriptionGetStreamBasicDescription(description as! CMAudioFormatDescription)?.pointee {
                channels = max(1, min(2, Int(basic.mChannelsPerFrame)))
                if basic.mSampleRate >= 8_000 { sampleRate = min(48_000, basic.mSampleRate) }
            }
            let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVNumberOfChannelsKey: channels,
                AVSampleRateKey: sampleRate,
            ])
            output.alwaysCopiesSampleData = false
            if reader.canAdd(output) {
                reader.add(output)
                audioOutput = output
            }
        }

        let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
        // moov at the front: playback can start before the whole file arrives.
        writer.shouldOptimizeForNetworkUse = true
        let colour: [String: Any] = [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ]
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: outWidth,
            AVVideoHeightKey: outHeight,
            AVVideoColorPropertiesKey: colour,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: videoBitrate,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()) * 2,
                AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
                AVVideoAllowFrameReorderingKey: true,
            ],
        ])
        videoInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(videoInput) else { throw NSError(domain: "KunThaiVideo", code: 3) }
        writer.add(videoInput)

        var audioInput: AVAssetWriterInput?
        if audioOutput != nil {
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVNumberOfChannelsKey: channels,
                AVSampleRateKey: sampleRate,
                AVEncoderBitRateKey: channels > 1 ? 128_000 : 96_000,
            ])
            input.expectsMediaDataInRealTime = false
            if writer.canAdd(input) {
                writer.add(input)
                audioInput = input
            }
        }

        guard reader.startReading(), writer.startWriting() else {
            throw reader.error ?? writer.error ?? NSError(domain: "KunThaiVideo", code: 4)
        }
        writer.startSession(atSourceTime: timeRange.start)

        let group = DispatchGroup()
        let span = max(0.1, end - start)
        var lastReported = -1.0

        group.enter()
        let videoQueue = DispatchQueue(label: "app.kunthai.video.v")
        videoInput.requestMediaDataWhenReady(on: videoQueue) {
            while videoInput.isReadyForMoreMediaData {
                guard reader.status == .reading, let sample = videoOutput.copyNextSampleBuffer() else {
                    videoInput.markAsFinished()
                    group.leave()
                    return
                }
                let seconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) - start
                let progress = max(0, min(1, seconds / span))
                if progress - lastReported >= 0.04 {
                    lastReported = progress
                    self.notifyListeners("progress", data: ["id": id, "progress": progress])
                }
                if !videoInput.append(sample) {
                    reader.cancelReading()
                    videoInput.markAsFinished()
                    group.leave()
                    return
                }
            }
        }

        if let audioInput, let audioOutput {
            group.enter()
            let audioQueue = DispatchQueue(label: "app.kunthai.video.a")
            audioInput.requestMediaDataWhenReady(on: audioQueue) {
                while audioInput.isReadyForMoreMediaData {
                    guard reader.status == .reading, let sample = audioOutput.copyNextSampleBuffer() else {
                        audioInput.markAsFinished()
                        group.leave()
                        return
                    }
                    if !audioInput.append(sample) {
                        audioInput.markAsFinished()
                        group.leave()
                        return
                    }
                }
            }
        }

        group.wait()
        if reader.status == .failed || writer.status == .failed {
            writer.cancelWriting()
            throw reader.error ?? writer.error ?? NSError(domain: "KunThaiVideo", code: 5)
        }

        let finished = DispatchSemaphore(value: 0)
        writer.endSession(atSourceTime: timeRange.end)
        writer.finishWriting { finished.signal() }
        finished.wait()
        guard writer.status == .completed else {
            throw writer.error ?? NSError(domain: "KunThaiVideo", code: 6)
        }

        try? FileManager.default.removeItem(at: input)
        let bytes = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber)?.int64Value ?? 0
        notifyListeners("progress", data: ["id": id, "progress": 1.0])
        return [
            "skipped": false,
            "path": output.path,
            "bytes": bytes,
            "width": outWidth,
            "height": outHeight,
            "durationSeconds": end - start,
            "trimmed": trimmed,
        ]
    }
}
