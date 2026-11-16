# Video Editor v1.1.0

**Current documentation version:** `v1.1.0` · **Previous release:** `v1.0.0` (November 15, 2026)

Version 1.1.0 extends the initial release with video rotation, fixed output canvas controls, and optional automatic subtitles using a separately deployed Shared STT service. Availability depends on the installed source revision and service configuration; the version label alone does not establish that every export combination has passed runtime testing.

**A browser-based video editor powered by FFmpeg WebAssembly and FastAPI.**

Video Editor is a lightweight, self-hosted video editing application that allows users to edit and process video files directly in their web browsers.

The application provides an interactive timeline, video trimming, segment removal, playback speed adjustment, video fade-in and fade-out, video transitions, color adjustment, cropping, rotation, resizing, fixed output canvas, image overlays, audio processing, background music mixing, audio keyframe automation, motion keyframes for text and image overlays, frame capture, and downloadable output files. It also supports multiple text overlays, a dedicated Subtitle Editor with SRT/WebVTT import and optional automatic subtitle generation through a separately configured speech-to-text (STT) service in the single-video editor, and multi-file video merging in a dedicated merge interface.

FFmpeg WebAssembly performs media processing in the browser, while the FastAPI backend handles editing recipe validation, FFmpeg execution plans, and preset management.

Normal editing and exporting do not upload selected source videos or background audio files to the application server. **Exception:** Automatic Subtitles uploads the selected media to the Video Editor backend for forwarding to the configured STT service. This is a separate, opt-in processing path.

## Try It Online

**[Open Video Editor](https://vedit.glitter.kr)**

| Tool              | URL                                            | Best for                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Video Editor | [Open Editor](https://vedit.glitter.kr/t/app)  | Trimming, removing segments, playback speed, video fade-in/out, color adjustment, cropping, resizing, background music mixing, audio keyframe automation, animated text and image overlays with motion keyframes, and subtitle editing |
| Video Merge       | [Open Merge](https://vedit.glitter.kr/t/merge) | Joining multiple videos with configurable clip-boundary transitions and a visual-only browser transition preview                                                                                                                       |

**Privacy at a glance:** Normal editing processes selected source videos, image overlays, and background audio in the browser. **Automatic Subtitles is an exception:** it transfers the selected media to the Video Editor backend and the configured STT service for speech recognition. Editing settings are sent to the backend for validation and plan generation. See [Privacy and File Processing](#privacy-and-file-processing) for details.

## Choose a Workflow

- **Edit one video:** Open `/t/app` to trim, remove segments, adjust playback speed, apply video fade-in/out, configure transitions between retained segments, adjust video colors, crop, rotate, scale, configure the output canvas, mix background music with the original audio, automate both audio tracks with keyframes, animate text and image overlays with motion keyframes, or edit timed subtitles.

- **Join several videos:** Open `/t/merge` to select, reorder, and combine video files into a single MP4, optionally applying transitions at adjacent file boundaries and previewing each selected boundary visually before export.

- **Self-host:** Follow [Installation](#installation) and [Configuration](#configuration) to run the application on your own machine or server.

## What's New in v1.1.0

- **Video Rotation:** Adjust the source picture orientation in the full editor and review the resulting frame and composition.
- **Fixed Output Canvas:** Set an output frame independently of aspect-preserving Scale, with framing and padding behavior to be confirmed in the final encoded file.
- **Automatic Subtitles:** Generate Korean, English, or automatically detected speech transcription through an optional Shared STT service; review the proposed cues and apply them to the existing Subtitle Editor.
- **Privacy clarification:** Ordinary editing and MP4 export remain browser-side; requesting automatic transcription uploads the selected media to the Video Editor backend and the configured STT service.
- **Documentation and verification:** Clarifies backend STT configuration, API endpoints, release scope, and which workflows were tested versus those awaiting output verification.

**Compatibility:** These are intended as backward-compatible feature additions to v1.0.0. Operators should confirm the deployed revision and existing recipe/preset compatibility before upgrading production installations.

## Key Features

### Video Editing

- **Interactive Timeline:** Navigate videos using Canvas-based thumbnails, a playhead, seeking, zooming, and scrolling.

- **Trim:** Select the portion of a video to keep.

- **Remove Segments:** Exclude unwanted sections from the output.

- **Playback Speed:** Speed up or slow down the edited video from 0.25× to 4.0×, including its retained original audio.

- **Video Fade:** Independently fade the beginning and end of the final edited video to or from black, with durations of 0–10 seconds each.

- **Video Transitions:** Apply Crossfade, Fade Through Black, Wipe Left, or Wipe Right at eligible boundaries between retained segments (`/t/app`) or adjacent files (`/t/merge`).

- **Color Adjustment:** Adjust Brightness, Contrast, Saturation, and Gamma with live WebGL preview and FFmpeg WebAssembly output.

- **Crop:** Select a specific region of the video frame.

- **Rotate:** Adjust video orientation in the full editor. Verify the resulting frame orientation and dimensions in the exported file.

- **Scale:** Resize video output to the desired dimensions.

- **Fixed Output Canvas:** Configure a fixed output frame separately from aspect-preserving Scale behavior. Check the selected framing and any letterboxing/pillarboxing in the preview and encoded output.

- **Output Settings:** Configure supported output containers and bitrate options.

- **Audio Keyframes:** Automate original audio and background music volume independently over the final output timeline (`/t/app`).

- **Motion Keyframes:** Animate Text Overlay and Image Overlay position, scale, and opacity with linearly interpolated keyframes (`/t/app`).

### Rotation and Fixed Output Canvas

The full editor supports rotation and a fixed output canvas as distinct concepts from Crop and Scale:

- **Rotation** changes the orientation of the picture. Confirm the relationship between source rotation metadata, displayed orientation, Crop coordinates, and the encoded output before relying on a particular result.
- **Keep aspect ratio** scales the picture within the requested dimensions without automatically promising a padded, fixed-size frame.
- **Fixed output canvas** is intended to preserve the configured output frame size even when the scaled picture has a different aspect ratio. Inspect how unused frame areas are filled and how overlays are positioned.
- **Composition checks:** Recheck Text Overlay, Image Overlay, subtitles, and motion coordinates after changing rotation, Crop, Scale, or canvas settings. Validate the actual exported width, height, and orientation rather than treating the UI estimate as an encoding guarantee.

**Verification scope:** These additions are documented as implemented features based on the project discussion. Their exact control labels, recipe field names, filter order, padding behavior, and complete cross-feature export results have not been independently established from the supplied README alone. They should be confirmed against the current source and actual output before publishing them as guaranteed behavior.

### Playback Speed

The full editor at `/t/app` supports a single playback-speed setting for the edited video:

- Choose a preset speed (0.5×, 0.75×, 1.0×, 1.25×, 1.5×, or 2.0×), or enter a custom value from **0.25× to 4.0×**.

- Reset the speed to **1.0×** at any time. Speed changes participate in the existing Undo/Redo recipe history.

- Preview the video at the selected speed. Retained original audio follows the video speed; background music keeps its normal playback speed.

- Use the original/source timeline for Trim and Remove Segments. A separate **output-time track** shows the resulting playback duration, start/midpoint/end ticks, and an output-time playhead for seeking.

- Apply speed to the retained video and original audio in the browser-side FFmpeg WebAssembly export. Background Music and Text Overlay are aligned to the resulting output timeline.

For example, a 5.050-second retained video has an estimated output duration of **2.525 seconds at 2.0×** or **10.100 seconds at 0.5×**. Encoded MP4 duration can differ slightly due to frame and timestamp boundaries.

**Verified workflow:** The project operator confirmed actual MP4 output at 2.0× with synchronized original audio; 0.5× output with Background Music; custom boundary speeds of 0.25× and 4.0×; and combinations with Remove Segments and Text Overlay. These confirmations cover the tested workflows, not every browser, codec, or device.

### Video Fade In / Fade Out

The full single-video editor at `/t/app` supports independent visual Fade In and Fade Out effects:

- **Fade In:** Gradually reveal the final edited video from black at its beginning.

- **Fade Out:** Gradually transition the final edited video to black at its end.

- Enable or disable each effect independently, with a duration from **0 to 10 seconds** in 0.1-second steps.

- Use synchronized duration sliders and numeric inputs. Both effects are disabled by default, with their durations initially set to **1.0 second**; **Reset** restores these defaults.

- Preview the visual effects in the browser and see their intervals on the **output-time track**.

- Apply the effects during FFmpeg WebAssembly MP4 processing after the edited video and Text Overlay composition. Text overlays therefore fade with the video.

- Keep the original audio and Background Music settings unchanged: **Video Fade affects the picture only**, not audio volume.

- Include Video Fade settings in the existing Undo/Redo workflow and compatible editing recipes and presets. Older recipes without `video_fade` default to both effects disabled.

**Output-time rule:** Video Fade uses the final edited output duration after Trim, Remove Segments, and Playback Speed. Fade In starts at output time zero; Fade Out ends at the output boundary. The effects do not change the output duration and do not restart at the boundaries between retained segments.

**Overlap validation:** The sum of enabled Fade In and Fade Out durations must be **less than or equal to the final output duration**. An equal sum is allowed; a greater sum is rejected by the editor and API. Invalid durations are not automatically shortened, and processing cannot begin until the user corrects the settings. Disabled or zero-duration effects contribute zero to this sum.

**Verified workflow:** The project operator confirmed successful final MP4 output combining **Remove Segments and Video Fade**. This verifies that combination in the tested workflow, not all browsers, codecs, or other combinations.

### Video Transitions v1.0

Video Transitions v1.0 is implemented in both the full single-video editor (`/t/app`) and the multi-file merge interface (`/t/merge`). It offers four transition types:

- **Crossfade:** Blend the outgoing and incoming pictures.
- **Fade Through Black:** Transition from the outgoing picture through black to the incoming picture.
- **Wipe Left:** Reveal the incoming picture with a leftward wipe.
- **Wipe Right:** Reveal the incoming picture with a rightward wipe.

Choose a transition independently for each eligible boundary. The default is **None** (a direct cut). Active transitions have a configurable duration of **0.1–3.0 seconds**; the interface provides a slider, numeric input, and a reset action.

**Full editor (`/t/app`):** Boundaries are created between retained video segments after Remove Segments. Each transition is associated with the source-time boundary pair, so a changed or removed boundary does not silently transfer its transition to another boundary. Undo/Redo can restore prior editing states. The browser provides an approximate auxiliary-video transition preview and marks selectable transition regions on the output timeline. The original source timeline remains unchanged.

**Video Merge (`/t/merge`):** Boundaries are created between adjacent video files. Each setting follows the ordered pair of file IDs; reordering can change the available boundaries. If the same pair becomes adjacent again during the session, its transition setting can be restored. Removing a file or clearing all files discards the affected settings. The connection timeline shows transition regions and the estimated merged duration. The selected boundary also has a browser-based, visual-only Transition Preview in the Video Transitions section.

### Video Merge Transition Preview v1.0

The `/t/merge` interface includes a **visual-only, browser-based preview** for transitions between adjacent source files. It is part of the **Video Transitions** panel and does not change the existing merge plan or FFmpeg WebAssembly export pipeline.

- **Boundary selection:** Expand **Video Transitions** and select a boundary from its list or the connection timeline. The preview displays the outgoing and incoming clips for that boundary.
- **Playback controls:** Use **Play/Pause**, **Replay**, and the seek slider to inspect the transition at different moments. The preview reports its current time and state.
- **Supported effects:** Preview **Crossfade**, **Fade Through Black**, **Wipe Left**, and **Wipe Right** on Canvas. Selecting **None** displays a direct cut without overlapping the clips.
- **Timing and framing:** The preview uses the selected clips' trim ranges, configured transition duration, and output aspect ratio. Different source sizes are displayed with letterboxing as needed.
- **Local rendering:** Two reusable, muted browser video elements decode the selected local files. A shared preview clock coordinates Canvas compositing and corrects playback position when necessary. The preview does not upload media or run FFmpeg WebAssembly.
- **State changes:** Changing the boundary, clip trim, transition configuration, or output size invalidates outdated preview work. Closing the preview or clearing files stops playback and releases preview object URLs. A decode failure is reported without altering the merge plan or preventing an otherwise valid export.

**Audio and fidelity:** The preview is intentionally silent; it does not audition original audio or `acrossfade` mixing. Audio transitions are included in the exported MP4. Browser decoding, seeking, Canvas scaling, and frame timing may differ from the FFmpeg-encoded result, so the preview is a visual guide rather than a frame-exact export simulation.

**Implementation status:** **Video Merge Transition Preview v1.0 source implementation is complete.** Operator manual verification of preview playback, seeking, boundary changes, failure handling, and visual agreement with the exported MP4 is still pending. The previously verified multi-transition MP4 export is a separate result and must not be represented as verification of this preview.

**Timing:** An active transition overlaps the outgoing and incoming clips rather than adding a separate interval. The estimated output duration is the sum of retained clip durations **minus the durations of active transitions**. The backend validates transition types, eligible boundaries, duplicates, individual durations, and the combined transition durations around neighboring clips. A boundary with None retains the existing direct-cut behavior.

**Processing and audio:** Browser-side FFmpeg WebAssembly uses `xfade` for active video transitions and `acrossfade` for retained original audio, with appropriately timed silence for inputs without audio in the merge workflow. The full editor's Background Music remains aligned with the completed output timeline. When all transitions are None, the existing direct-cut processing path is retained. Processing and cancellation use the established workflows.

**Recipe compatibility:** The full editor stores optional `video_transitions` settings and the selected boundary in its recipe history, Undo/Redo, and presets. Older recipes without transition settings retain direct cuts. Settings referencing boundaries that do not exist in a different video are rejected rather than silently reassigned.

**Operator verification:** All **four transition types** were manually verified in actual MP4 output in `/t/app`. The operator also confirmed **10/10 reported combination and workflow checks**: Playback Speed, Video Fade, Color Adjustment, Text Overlay, Image Overlay, Background Music, Original Audio, Multiple Transitions, Undo/Redo plus Preset, and Validation plus Cancellation. In `/t/merge`, the operator confirmed **actual MP4 output with multiple configured transitions** and successful browser loading of the generated file. These results establish completion of the reported Video Transitions v1.0 design and manual verification scope, not universal compatibility across browsers, codecs, or devices.

### Color Adjustment

The full single-video editor at `/t/app` provides four global video color controls. Each setting has a synchronized slider and numeric input with a 0.01 step:

| Control    | Minimum | Neutral default | Maximum |
| ---------- | ------: | --------------: | ------: |
| Brightness |   -1.00 |            0.00 |    1.00 |
| Contrast   |    0.00 |            1.00 |    2.00 |
| Saturation |    0.00 |            1.00 |    3.00 |
| Gamma      |    0.10 |            1.00 |    3.00 |

- Expand **Color Adjustment** to change the four settings. **Reset** restores all neutral defaults.

- Preview all four adjustments, including Gamma, using browser-side WebGL video-frame rendering. Text Overlay and the black Video Fade layer remain above the color-adjusted video preview.

- Export the adjusted video through the FFmpeg WebAssembly `eq` filter. Neutral settings omit the unnecessary color filter.

- Apply one color configuration to the entire retained output video, including the portions assembled by Trim and Remove Segments. Color Adjustment does not change the output duration or audio.

- Color processing precedes Text Overlay compositing, followed by Video Fade. Consequently, text retains its selected color while the composited video and text fade together.

- Include `color_adjustment` in editing recipes, Undo/Redo, and compatible presets. Older recipes and presets without color settings use neutral defaults.

- Validate finite numeric values, supported ranges, and 0.01 increments. Invalid inputs are shown for correction and prevent processing rather than being silently replaced.

- If WebGL preview is unavailable, the editor displays the unadjusted video with a warning while retaining the settings for FFmpeg output.

**Verified workflow:** The project operator manually confirmed browser preview and final MP4 output for Brightness (`0.30`), Contrast (`1.50`), Saturation (`0.00`, grayscale), and Gamma (`1.50`). Reset to neutral values, combined MP4 output with Text Overlay, Video Fade, and Remove Segments, and Undo/Redo and Preset restoration were also confirmed. **All nine reported manual verification items passed.** These results cover the tested workflows, not every browser, codec, or device.

### Text Overlay

The full editor at `/t/app` supports multiple text overlays on a source video:

- Add, select, edit, and delete individual text overlays.

- Configure text content, start and end times (milliseconds), horizontal and vertical position (percent), font size (pixels), font color, and alignment.

- Preview active overlays on the video while playing or seeking; the timeline indicates text display intervals and the selected item.

- Use the existing undo/redo workflow for text changes.

- Render text into transparent PNG images in the browser and composite it into the final video using the bundled FFmpeg WebAssembly `overlay` filter.

- Keep overlay timing aligned with the processed output after Trim and Remove Segments, then apply Crop and Scale in the processing plan.

**Verified workflow:** The project operator confirmed that timed text appears in the browser preview and is composited into the downloaded MP4. This does not imply validation of every browser, font, codec, or device.

### Motion Keyframes v1.0

The full single-video editor (`/t/app`) includes **Motion Keyframes v1.0** for individual Text Overlay and Image Overlay items. Motion settings are edited within the corresponding overlay's **Motion Keyframes** panel, rather than in a separate global effects track.

- **Animated properties:** Set keyframe time, horizontal position (X), vertical position (Y), scale, and opacity for a selected text or image overlay.
- **Interpolation:** Values change linearly between keyframes. Motion is evaluated using the **final edited output timeline**, so playback and seeking use output-time coordinates.
- **Preview and timeline:** The browser preview applies the selected overlay's animated properties. The output-time track indicates the selected overlay's active interval and keyframe markers; markers can be selected. Keyframe time editing uses the list and numeric controls, not timeline-marker dragging.
- **MP4 composition:** For motion-enabled overlays, the browser prepares transparent PNG frame sequences with Canvas and writes them into the FFmpeg WebAssembly virtual filesystem for compositing. Overlays without motion retain their existing static processing path.
- **Recipe and editing history:** Motion data is stored within each overlay's recipe settings and participates in Undo/Redo and preset restoration. Frontend and FastAPI validation cover keyframe times, values, counts, and image placement within the output frame.
- **Compatibility:** Existing text and image overlays remain usable without enabling motion. Image presets continue to store metadata rather than local image bytes, so image files may need to be selected again.

**Processing limits:** Motion PNG preparation is limited to **1,200 frames**, **4 million output pixels**, and **128 MiB of PNG data**. Long animations, large output dimensions, or multiple motion-enabled overlays may reach these limits or exhaust browser memory.

**Implementation status:** Motion Keyframes v1.0 source implementation is reported complete in `/t/app`; `/t/merge` and `/t/min` were not changed. **Operator manual verification of animated MP4 output, preview/export consistency, feature combinations, and cancellation/retry is pending.** No successful Motion Keyframes MP4 export or automated test run is claimed here.

### Subtitle Editor v1.0

The full single-video editor (`/t/app`) includes a dedicated **Subtitle Editor v1.0**, separate from Text Overlay. The implementation provides editing, validation, browser preview, and a browser-side FFmpeg WebAssembly MP4 compositing path.

- **Subtitle cues:** Add, select, edit, and delete cues in a time-ordered list. Each cue has text, a start time, and an end time expressed in integer milliseconds on the **final edited output timeline**.
- **Import:** Load local **SRT (`.srt`)** or **WebVTT (`.vtt`)** files in the browser. If parsing or import fails, the existing cue list is preserved. Subtitle text is treated as text, not HTML.
- **Shared subtitle style:** Configure font size, text color, outline color, outline width, horizontal alignment, and bottom margin. Reset restores the default subtitle style.
- **Preview and timeline:** Show active subtitles in the browser preview and select subtitle cues using their output-time intervals.
- **Validation:** Frontend and FastAPI validation cover cue IDs, integer millisecond times, output-duration bounds, overlapping cues, a maximum of **100 cues**, a maximum of **two lines and 160 characters per cue**, and supported style ranges. Invalid configurations must be corrected before processing.
- **MP4 composition:** The browser renders subtitle cues as transparent PNG assets using Canvas. FFmpeg WebAssembly composites them with timed `overlay` filters **after Image Overlay and before Video Fade**. The resulting subtitle picture is affected by Video Fade.
- **Editing state:** Subtitle settings participate in the existing recipe, Undo/Redo, and preset workflows. Older recipes without subtitle settings are interpreted as having no cues.
- **Localization:** The controls use the existing English/Korean interface and Light/Dark themes.

**Scope:** Subtitle Editor v1.0 is available in `/t/app` only. It supports one subtitle track and does not implement the complete WebVTT styling specification or ASS/SSA subtitles. Subtitle rendering depends on fonts available in the browser; exact cue boundaries may vary slightly in the encoded MP4. The audio-extraction and separate frame-capture workflows do not add subtitle-compositing filters.

**Verified workflow:** The operator reported **15/15 PASS** in manual checks, including English and Korean cue preview, timing and styling, standalone MP4 output, SRT and WebVTT import with MP4 output, validation, Undo/Redo and presets, combinations with video transitions, overlays, color adjustment, Video Fade, Playback Speed, Remove Segments, and Background Music, and cancellation/retry and subtitle-free MP4 output. These checks cover the reported workflows, not all browsers, codecs, or devices.

### Automatic Subtitles (Shared STT Integration)

The full editor (`/t/app`) includes an **Automatic Subtitles** workflow within the Subtitle Editor. Unlike manual subtitle editing and local SRT/WebVTT import, automatic transcription requires a separately running speech-to-text service and transfers media to that service through the Video Editor backend.

- **Languages:** Select automatic language detection, Korean, or English (`auto`, `ko`, `en`).
- **Generate:** Submit the selected source media from the browser to `POST /api/stt/transcriptions` as multipart form data. The Video Editor backend forwards it to the configured Shared STT service.
- **Job controls:** Poll the transcription job, retrieve the result, or request cancellation. Display progress and failures without silently replacing existing subtitles.
- **Review first:** Inspect generated subtitle cues and choose whether to keep or replace existing cues. Apply or discard the proposed changes. Applied subtitle changes participate in the editor's existing Undo/Redo workflow.
- **Timeline alignment:** Convert transcription timestamps from source seconds to integer milliseconds on the **final edited output timeline**, accounting for retained segments, playback speed, and transition overlaps. Segments outside retained source ranges must not become invalid output cues.
- **Validation:** Generated cues must satisfy the existing Subtitle Editor rules, including the 100-cue maximum, 160-character and two-line limits, valid output-time boundaries, and no overlapping cues. Review and correct results before export.
- **Export:** Accepted cues use the existing browser-side subtitle compositing pipeline; the STT service does not render or export the finished MP4.

**Authentication boundary:** The Video Editor interface does not require a separate STT login or display an STT API key. The Video Editor backend uses its own `STT_API_KEY` setting to authenticate to the Shared STT service using the `X-API-Key` header. The Shared STT web UI password (`STT_UI_PASSWORD`) is unrelated and must not be used as this API key.

**Observed verification (updated November 16, 2026):** An initial test returned `503` because the STT API key was not configured. After correcting the server-side key configuration, a browser test confirmed submission (`202`), job polling (`200`), result retrieval (`200`), recipe validation (`200`), and application of two Korean subtitle cues with preview at approximately 0.598 s and 2.408 s. **Final MP4 export with the newly generated cues has not yet been verified.** The tested source was a screen recording with subtitles already present in its pixels; those recorded captions are distinct from the newly applied STT cues.

### Image Overlay

The full single-video editor at `/t/app` supports **Image Overlay v1.0**, allowing logos, watermarks, and other images to appear over the edited video:

- Add, select, replace, and remove up to **10 images** in one recipe. Supported local file types are **PNG, JPEG, and WebP**, including transparent PNG images.

- Adjust each image's start and end time on the **final edited output timeline** (milliseconds), X/Y position, width, and opacity. The image aspect ratio is preserved.

- Select an image in the browser preview, drag it to reposition it, or resize it using a corner handle. Image placement is constrained to the output frame.

- Change stacking order with **Move Up** and **Move Down**. Each image is displayed only during its configured interval.

- Use the image intervals and selection state shown on the output-time track.

- Combine images with Trim, Remove Segments, Playback Speed, Color Adjustment, Text Overlay, and Video Fade. The composition order places **Image Overlay after Color Adjustment and Text Overlay, and before Video Fade**. Thus color adjustments do not recolor image overlays, while Video Fade affects the composited image.

- Composite the images into the final MP4 with the browser-side FFmpeg WebAssembly `overlay` filter. Image files remain in the browser; the backend validates recipe metadata and generates a processing plan.

- Restore overlay metadata and editing operations with Undo/Redo and presets. Presets do **not** store the image bytes: after loading a preset, the corresponding local files may need to be selected again before processing.

- Use the existing English/Korean interface and Light/Dark themes.

**Verified workflow:** The project operator reported **13/13 PASS** in manual checks covering PNG/JPEG/WebP loading, transparent PNG alpha, browser preview, dragging and corner resizing, position/width/opacity adjustments, timed visibility, multiple-image stacking, standalone MP4 output, MP4 output combined with Color Adjustment, Text Overlay, Video Fade, and Remove Segments, and Undo/Redo plus preset restoration. These results apply only to the reported workflows; they are not a guarantee of compatibility with every browser, codec, operating system, or device.

### Video Merge

The separate `/t/merge` interface connects multiple source videos into one output, with optional Video Transitions v1.0 at adjacent file boundaries:

- Select multiple local video files and arrange their order.

- Configure clips, supported output settings, and optional Crossfade, Fade Through Black, Wipe Left, or Wipe Right transitions between adjacent files.

- Request a validated merge processing plan from `/api/merge/plan`.

- Review the connection timeline and estimated output duration, then process the merge locally in the browser with FFmpeg WebAssembly and download the result.

The current merge request supports 2–20 input files and up to 100 clips. The browser merge interface limits the combined input size to 2 GiB. Merge output is MP4 with H.264 (`libx264`) video and AAC audio; configured output dimensions are limited to 3840 × 2160 and frame rate to 60 FPS. These are validation and configuration limits, not processing guarantees.

**Verified merge workflow:** The operator manually confirmed successful MP4 output with multiple configured file-boundary transitions and loaded the resulting MP4 in the full editor. In one 30 FPS example, the connection timeline estimated **13.023 seconds** and the encoded MP4 reported **13.066 seconds** (a **43 ms** difference). The source of this difference has not been established; frame/timestamp boundaries and audio/video stream lengths may contribute.

### Audio Processing and Background Music

The full editor at `/t/app` supports browser-based background music mixing alongside its existing audio operations:

- Select, replace, or remove one local background audio file.

- Adjust the original video audio volume and background music volume independently (0–200%).

- Set the background music start position on the **edited output timeline** in milliseconds.

- Choose the portion of the music file to use with audio trim start and end values.

- Apply configurable fade-in and fade-out durations.

- Preview the mix with synchronized video playback, seeking, and retained segments after Trim or Remove Segments.

- View the selected music clip on a dedicated timeline track and include audio-mix settings in Undo/Redo.

- Export the final MP4 with original audio and background music mixed by FFmpeg WebAssembly in the browser.

- Set **Original Audio Volume** to **0%** to hear only the selected background music in the final output.

The existing audio modes remain available:

- **Keep:** Retain the original audio when no mix is configured, or use the configured audio mix when enabled.

- **Mute:** Silence the final output, including background music.

- **Extract:** Preserve the original audio extraction workflow; this mode does not extract the background music mix.

The initial Audio Mix implementation accepts **one background music file at a time**. Music does not loop automatically and is truncated at the end of the output video. An input video without an audio stream can still receive background music.

**Verified workflow:** The project operator confirmed that the implemented Background Music / Audio Mix features work in the tested workflow, including final output. This does not establish compatibility with every input format, browser, device, or operating system.

### Audio Keyframes v1.0

The full single-video editor (`/t/app`) includes **Audio Keyframes v1.0**, providing independent volume automation for **Original Audio** and **Background Music**. This feature is not available in `/t/merge` or `/t/min`.

- **Independent tracks:** Enable or disable automation separately for original audio and background music. Each track supports adding, selecting, deleting, and resetting keyframes.

- **Editing controls:** Use the interactive volume graph to select or drag keyframes, or enter precise keyframe times and volume values numerically. Keyframe positions also appear on the output-time track. A completed valid drag is recorded as one history action.

- **Output-time coordinates:** Keyframe times are integer milliseconds on the final output timeline after Trim, Remove Segments, Playback Speed, and Video Transitions. Changes to the output duration or transitions must be checked against existing keyframe positions.

- **Volume interpolation:** Values range from **0% to 200%**. Volume changes linearly between adjacent keyframes; before the first and after the last keyframe, the nearest keyframe value is held.

- **Mixing behavior:** Each track's effective gain combines its existing base volume with the keyframe automation. Background Music retains its existing fade settings. **Mute** takes precedence and silences the output; **Extract** retains the existing original-audio extraction behavior without keyframe automation.

- **Browser preview:** The editor applies automation through its Web Audio gain nodes while playing or seeking. FFmpeg WebAssembly applies time-dependent volume expressions to the assembled original audio and background music during export. Browser preview and encoded audio can differ slightly near audio-frame boundaries.

- **Recipe and validation:** The optional `audio_keyframes` recipe field participates in Undo/Redo and preset restoration. Frontend and FastAPI validation check track settings, unique keyframe IDs and times, finite volume values, integer-millisecond timing within the output duration, and a maximum of **100 keyframes per track**. Older recipes without this field use disabled automation.

**Implementation status:** Source implementation is reported complete. **Operator manual verification of Audio Keyframes MP4 output is pending**; no successful audio-automation export or automated test run is claimed here.

### Frame Capture

Capture individual video frames and save them as PNG images.

### Editing Workflow

- Undo and redo editing actions.

- Loop video playback.

- Use keyboard shortcuts for supported actions.

- Validate editing recipes before processing.

- Monitor processing progress.

- Cancel processing when supported.

- Preview and download generated output files.

### Project Saving, Deletion, and Recovery (`/t/app`)

The full editor separates **saved projects** from the **current editing session** and its recent-work recovery record. These operations are browser-local and distinct from backend preset storage.

- **Save and load projects:** Use the **Actions** menu to manage saved editing projects. A saved project has its own persistent project ID; the editor's current session can continue independently of that saved record.
- **Delete Saved Project:** The **Delete Saved Project** action (Korean: **프로젝트 저장 삭제**) removes only the currently associated saved project (`state.projectId`). It does **not** clear the loaded video, timeline, current editing settings, or the `recent:app` recovery record. It is not a command to discard the current editing session.
- **Save ordering:** Project-specific save operations are queued. Deletion waits for pending saves associated with the saved project, reducing the risk that an in-flight save recreates a deleted record.
- **Media references:** Deletion cleans up media belonging to the deleted saved project while preserving media still referenced by recent-work recovery data.
- **Recovery after deletion:** The current editing state is written back to the recent-work recovery record. A failed recovery write must not be reported as an unqualified successful deletion workflow.
- **Restore on return:** When recent recovery data is available on a later visit, the editor offers a restore choice. Choosing **Later** does not immediately delete that recovery record.
- **Project JSON:** The existing project JSON import/export workflow is retained. A JSON file carries editing configuration; restoring the working media may require the user to select the corresponding local source video again. Do not assume JSON alone embeds or restores local video bytes.

**Persistence scope:** The recent-work mechanism uses one `recent:*` record per editor screen, rather than an unlimited version history. Recovery depends on the browser's IndexedDB data remaining available and sufficient storage capacity. Clearing site data, storage failures, or browser eviction can make recovery impossible. Concurrent editing of the same project in multiple tabs is not fully conflict-safe.

**Verification status:** The changes above are based on a source-change report. Source static analysis and edits were reported, but no test, build, syntax check, development server run, or runtime verification was performed for this update. Users should manually confirm deletion behavior, recovery after reload, absence of unintended saved-project recreation, pending-save ordering, and failure messaging before treating these behaviors as operationally verified.

### Editor Navigation and Status UI (`/t/app`)

- The header's **Actions** dropdown groups project-related operations. Work/status messages are positioned to the right of that dropdown rather than presented as a separate header-bar status area.
- Project load and recovery guidance uses dialogs where user confirmation or media reselection is needed.
- A **Top** button remains fixed near the lower-right corner of the active viewport, including narrow layouts, and scrolls the relevant active page or container to the top when activated.
- The intended Top button appearance retains its text and border with a transparent background in default and interaction states. **The transparent-background styling was not confirmed in the supplied desktop/mobile browser screenshots**; the observed button still had a filled background. Do not describe this styling as verified until the effective CSS and browser behavior are checked.

### User Interface

- Korean and English localization.

- Browser-local saved projects, project JSON import/export, and recent-work recovery in the full editor.

- Light and dark themes.

- Browser-based interface without a traditional desktop installation.

- A dedicated multi-file merge interface alongside the full and minimal single-video editors.

### Browser-Based Processing

FFmpeg WebAssembly runs media processing within the browser environment.

The backend generates and validates processing instructions rather than receiving source videos for server-side transcoding. The optional Automatic Subtitles endpoint is a separate media-upload and speech-recognition workflow.

## Technology Stack

| Component                   | Technology                                      |
| --------------------------- | ----------------------------------------------- |
| Backend                     | Python, FastAPI, Uvicorn                        |
| Frontend                    | HTML5, CSS3, Vanilla JavaScript                 |
| Media Processing            | FFmpeg WebAssembly                              |
| Database                    | SQLite                                          |
| API                         | REST API, JSON                                  |
| Timeline                    | Canvas API                                      |
| Browser Processing          | WebAssembly, Web Workers, WebGL                 |
| Optional Speech Recognition | External Shared STT service via backend adapter |

## How to Use

### Edit a Single Video (`/t/app`)

1. **Open the editor.** Visit [the full editor](https://vedit.glitter.kr/t/app) or the corresponding route on your own installation.

2. **Select a video.** Choose a local file. The browser loads its metadata and timeline.

3. **Navigate the timeline.** Seek with the playhead, inspect thumbnails, and use zoom or scrolling when needed.

4. **Choose edits.** Trim the beginning or end, remove unwanted segments, adjust playback speed, apply video fade-in/out, crop or rotate the frame, scale the resolution, configure a fixed output canvas, adjust colors, adjust audio, or configure output settings. Available operations depend on the selected processing mode.

5. **Set playback speed if needed.** Expand **Playback Speed**, choose a preset or enter a custom speed between `0.25` and `4.0`, and review the output-time track. The original timeline remains the reference for Trim and Remove Segments.

6. **Apply Video Fade if needed.** Expand **Video Fade**, enable Fade In and/or Fade Out, and set each duration from 0 to 10 seconds. Check the output-time track and keep their combined active duration within the final output length.

   **Apply Video Transitions if needed.** After creating retained-segment boundaries with Remove Segments, expand **Video Transitions**, select a boundary, choose a transition type, and set its duration between 0.1 and 3.0 seconds. Review the shortened output-time track.

7. **Add background music if needed.** Open **Background Music**, select a local audio file, set the original and music volumes, and configure the music start, trim, and fades. Preview the result; set original audio volume to 0% to replace audible original sound with music. Expand **Audio Keyframes** to automate the original and/or music volume on the final output timeline.

8. **Add text or subtitles if needed.** Create timed Text Overlays or Image Overlays; expand the selected overlay's **Motion Keyframes** panel to animate position, scale, or opacity. Alternatively, expand **Subtitle Editor** to add subtitle cues, import SRT/WebVTT, or request Automatic Subtitles when the Shared STT service is configured; review the proposed cues before applying them. Set output-time intervals and configure the shared subtitle style.

9. **Validate the recipe.** Validation checks the editing configuration and supported constraints; it does not guarantee successful encoding on every browser or device.

10. **Run processing.** FFmpeg WebAssembly executes the generated plan locally in the browser. Processing time depends on the source file, operations, and device resources.

11. **Preview and download.** Inspect the generated output when the browser supports its format and codec, then download the video, extracted audio, or captured PNG frame as appropriate.

#### Playback Speed Example

1. Select a source video in `/t/app` and expand **Playback Speed**.

2. Choose `2.0×` to make the retained video play approximately twice as fast, or `0.5×` to make it play approximately twice as long. For other values, select **Custom** and enter a speed from `0.25` to `4.0`.

3. Check the **output-time track** for the estimated output duration. For a 5.050-second retained video, 2.0× corresponds to approximately 2.525 seconds.

4. Optionally remove unwanted segments, add a timed Text Overlay, or configure Background Music. Original audio follows the selected speed; background music stays at its normal speed.

5. Validate, process, and download the MP4. Play the downloaded file to confirm its duration and audio synchronization.

**Verified workflow:** The project operator confirmed the 2.0× and 0.5× exports, boundary speeds (0.25× and 4.0×), and the specified feature combinations. Actual encoding duration may vary slightly from the estimated timeline duration.

#### Video Fade Example

1. Select a video in `/t/app`, then expand **Video Fade**.

2. Enable **Fade In** and **Fade Out** and set each duration to `1.0` second.

3. Optionally use **Trim**, **Remove Segments**, or **Playback Speed**. Check the updated final duration on the output-time track.

4. Ensure that the combined active Fade durations do not exceed the final output duration. For example, a 3.2-second output can accept 1.0-second Fade In and 1.0-second Fade Out.

5. Preview the beginning and end, validate the recipe, and process the MP4. Check that the video fades from black at the start and to black at the end, while its audio remains unaffected by Video Fade.

**Verified combination:** The project operator manually confirmed the generated MP4 with **Remove Segments + Video Fade**. Fade applies at the beginning and end of the assembled output, rather than at each removed-segment boundary.

#### Video Transitions Example (`/t/app`)

1. Select a source video and use **Remove Segments** to create at least one boundary between retained portions.
2. Expand **Video Transitions**, select the boundary, and choose **Crossfade**, **Fade Through Black**, **Wipe Left**, or **Wipe Right**.
3. Set the transition duration between `0.1` and `3.0` seconds and check the output-time track. The transition shortens the assembled output by its overlap duration.
4. Optionally combine the transition with Playback Speed, Video Fade, Color Adjustment, Text Overlay, Image Overlay, or Background Music.
5. Validate, process, and inspect the resulting MP4 for visual continuity and audio synchronization. Browser preview is approximate and may not match every encoded frame.

**Verified workflow:** The operator manually confirmed MP4 output for all four transition types and the ten reported combinations and editing workflows.

#### Color Adjustment Example

1. Select a source video in `/t/app` and expand **Color Adjustment**.

2. Set **Brightness** to `0.30`, **Contrast** to `1.50`, **Saturation** to `0.00` for grayscale, or **Gamma** to `1.50` to inspect each adjustment independently.

3. Review the live video preview. Use **Reset** to restore Brightness `0.00` and Contrast, Saturation, and Gamma `1.00`.

4. Optionally combine Color Adjustment with Text Overlay, Video Fade, or Remove Segments. Color Adjustment affects video pixels; text colors are preserved, and Video Fade applies after compositing.

5. Validate, process, and download the MP4 to compare the encoded result with the preview.

**Verified workflow:** The operator confirmed all four individual preview-and-MP4 cases, Reset, the three combined MP4 outputs, and Undo/Redo and Preset restoration in nine reported manual checks.

#### Text Overlay Example

1. Select a source video and choose **Add Text**.

2. Enter `Hello Video Editor` and set the start and end times to `2000` and `6000` milliseconds.

3. Choose a font size, text color, alignment, and horizontal/vertical position.

4. Seek to approximately 4 seconds to see the text in the preview. Outside the 2–6 second interval, it should not be visible.

5. Add more text items if needed, then validate, process, and download the resulting video.

Text Overlay preview and compositing into a downloaded MP4 have been **confirmed by the project operator** in the tested workflow. Rendering may still vary with browsers, fonts, input formats, and device resources.

#### Motion Keyframes Example

1. Open `/t/app`, select a video, and create a Text Overlay or add a local image in **Image Overlay**.
2. Select the overlay, expand its **Motion Keyframes** panel, and add keyframes at different times on the final output timeline.
3. Set X/Y position, scale, and opacity at each keyframe. For example, move a logo across the frame while increasing its opacity from a lower value to full visibility.
4. Play and seek through the overlay interval to inspect the linear interpolation and select its keyframe markers on the output-time track. Edit exact times using the keyframe list or numeric inputs.
5. Optionally combine the animation with existing editing operations, then validate and process the MP4. Compare the encoded motion with the browser preview.
6. Check Undo/Redo and preset restoration. When restoring an image overlay preset, reselect any required local image file before processing.

**Verification status:** This example describes the implemented workflow, not a confirmed Motion Keyframes MP4 export. Motion-enabled PNG frame preparation is subject to frame-count, output-pixel, PNG-data, and browser-memory limits.

#### Subtitle Editor Example

1. Open `/t/app`, select a source video, and expand **Subtitle Editor**.
2. Select **Add Subtitle** to create a cue, or **Import SRT / VTT** to load subtitle cues from a local file.
3. Select a cue, edit its text and start/end times in milliseconds, and check the subtitle intervals on the output-time track. Cue timing follows the final edited output, not the original source timeline.
4. Configure the shared font size, text color, outline color and width, alignment, and bottom margin. Use **Reset Subtitle Style** to restore defaults.
5. Preview the relevant output-time intervals. Check that cues do not overlap and that all cue intervals fit within the final output duration.
6. Validate, process, and inspect the downloaded MP4 for subtitle timing, line breaks, Korean glyphs, color, outline, and interactions with Image Overlay and Video Fade.

**Verified workflow:** The operator confirmed the reported **15/15 Subtitle Editor v1.0 manual checks**, including imported SRT/WebVTT subtitle MP4 output and combined editing workflows.

#### Automatic Subtitles Example

1. Open `/t/app`, select a source video, and expand **Subtitle Editor** and **Automatic Subtitles**.
2. Choose **Auto**, **Korean**, or **English**, then select **Generate**. This sends the selected media to the backend and configured STT service; do not use this feature for media that you are not authorized to transfer.
3. Wait for the transcription job to finish, or select **Cancel** if needed. If the service is unavailable or not configured, resolve the backend configuration before retrying.
4. Review the returned cues and their alignment with Trim, Remove Segments, Playback Speed, and Video Transitions.
5. Choose to keep or replace existing subtitles, then **Apply** or **Discard** the proposed cues.
6. Validate the recipe and export an MP4 using the existing browser-side subtitle rendering pipeline. Check the encoded subtitle timing and text.

**Verification status (November 16, 2026):** After an initial configuration-related `503` was resolved, the browser completed STT submission, polling, result retrieval, cue review/application, and subtitle preview. Final MP4 export with the generated subtitles remains unverified.

#### Image Overlay Example

1. Select a source video in `/t/app`, expand **Image Overlay**, and choose **Add Image**.

2. Select a local PNG, JPEG, or WebP file. For a logo or watermark, a transparent PNG is useful.

3. Adjust **Start Time**, **End Time**, **X Position**, **Y Position**, **Width**, and **Opacity**. Drag the image or resize it with the preview handle if preferred.

4. Add more images if needed and use **Move Up** or **Move Down** to adjust the stacking order. Check the output-time track to confirm visibility intervals.

5. Optionally combine the overlay with Color Adjustment, Text Overlay, Video Fade, or Remove Segments. Validate, process, and download the resulting MP4.

6. When loading a preset with image overlays, reselect any local image files that are reported missing before processing.

**Verified workflow:** The project operator confirmed all **13 reported manual checks**, including standalone and combined MP4 output. This is a workflow-specific verification record, not a universal compatibility claim.

#### Audio Keyframes Example

1. Open `/t/app`, select a video with audio, and expand **Audio Keyframes**.

2. Under **Original Audio Automation**, enable automation and add keyframes at the desired final output times. For a five-second output, try `0 ms / 0%`, `1000 ms / 100%`, `4000 ms / 100%`, and `5000 ms / 0%`.

3. Select or drag points in the graph, or edit the time and volume inputs. The effective volume follows linear interpolation between points and combines with the base Original Audio Volume.

4. Optionally add a background music file, enable **Background Music Automation**, and create a separate set of keyframes. Existing background music fades remain active.

5. Preview the changes while playing and seeking. Check that all keyframe times remain within the output duration after Trim, Remove Segments, Playback Speed, or Video Transitions.

6. Validate, process, and listen to the downloaded MP4. Also check Mute, Extract, Undo/Redo, preset restoration, cancellation, and retry when applicable.

**Verification status:** This is a usage example and suggested operator manual check, not a report of a successful Audio Keyframes MP4 export.

#### Background Music Example

1. Select a source video in `/t/app` and expand **Background Music**.

2. Choose a local audio file and confirm that its clip appears on the timeline.

3. Set **Original Audio Volume** to `0%` if you want to hear only the music, or leave it above zero to mix both sources.

4. Set **Background Music Volume** to the desired level, such as `35%`, and optionally set its start position, trim boundaries, and fade durations in milliseconds.

5. Play and seek through the edited video to preview synchronization, including any retained segments after removals.

6. Select the normal MP4 output workflow, validate, process, and download the resulting file. Listen to the downloaded MP4 to confirm the intended mix.

The music start position refers to the **final edited video timeline**, not the original source time. Music that extends beyond the video is cut at the output boundary. The **Mute** audio mode silences the final result; **Extract** continues to use the original audio extraction workflow rather than exporting the mix.

### Merge Multiple Videos (`/t/merge`)

1. Open [Video Merge](https://vedit.glitter.kr/t/merge).

2. Select **2–20** local video files.

3. Arrange them in the desired playback order and configure supported clip ranges and output settings.

4. Optionally expand **Video Transitions**, select a boundary between adjacent files, and choose a transition type and duration (0.1–3.0 seconds). Configure each boundary independently.

5. Select a boundary in **Video Transitions** or the connection timeline to open its **Transition Preview**. Play, pause, replay, or seek through the selected transition. Repeat for other boundaries as needed. The preview is silent and is not a frame-exact representation of the exported MP4.

6. Review the connection timeline and estimated output duration, which subtracts active transition overlaps. Generate the merge plan and run FFmpeg WebAssembly processing in the browser.

7. Download the merged MP4 and review its playback, transitions, audio synchronization, and actual duration. Compare the encoded transitions with the visual preview when appropriate.

The merge interface supports up to 100 clips and a combined source-file size of 2 GiB. Its output is MP4 with H.264 video and AAC audio, with configured output limits of 3840 × 2160 pixels and 60 FPS. These limits do not guarantee successful processing on every device.

**Note:** Text Overlay belongs to the single-video editor (`/t/app`), not the merge interface (`/t/merge`). Video Merge shows transition intervals on its connection timeline and provides a visual-only preview for the selected boundary. Preview decoding errors do not change a valid merge plan; audio is evaluated in the final MP4, not in the preview.

**Verified workflow:** The operator confirmed multi-transition MP4 output in Video Merge. A small estimated-versus-encoded duration difference was observed in one example; the encoded file should be checked when frame-accurate duration matters.

### Capture a Frame or Extract Audio

The single-video editor can save an individual video frame as a PNG image or extract audio into a supported format. These are separate output operations; a captured PNG frame is not documented as including Text Overlay compositing.

## Platform Support

Video Editor is designed to run directly on Linux, Windows 11, Windows 10, and macOS, including supported virtual-machine environments. A virtual machine, WSL2, or Docker is **not required** for a native Windows installation.

The backend uses cross-platform Python libraries and SQLite. Media processing runs through FFmpeg WebAssembly in the browser, so a native FFmpeg executable is not required for the current editing workflow.

| Platform                      | Installation approach                     | Verification status                                             |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Linux                         | Native Python environment                 | Platform-specific testing is recommended                        |
| Windows 11 / Windows 10       | Native Python and PowerShell              | Source-compatible design; full native workflow not yet verified |
| macOS (Intel / Apple Silicon) | Native Python environment                 | Platform-specific testing is recommended                        |
| Virtual machines              | Install within the guest operating system | Depends on guest networking and browser resources               |

Platform compatibility at the dependency and source-code level does not establish that every editing operation has been tested on every operating system.

## Requirements

### Backend

- Python 3.11 or newer

- Python virtual environment support

- Dependencies listed in `requirements.txt`

### Browser

A modern browser with the capabilities required by the application, including:

- JavaScript

- WebAssembly

- Web Workers

- HTML5 media APIs

- WebGL for the optional color-adjusted video preview (MP4 processing remains available when this preview cannot be rendered)

FFmpeg WebAssembly also requires sufficient memory and compatible browser security settings.

Support for particular codecs, file sizes, and output formats varies by browser and device.

## Installation

Clone the repository:

```bash

git clone https://github.com/glitter-node/video-editor.git

cd video-editor

```

### Linux

Install Python 3.11 or newer and the Python virtual environment module using your distribution's package manager.

```bash

python3 -m venv venv

venv/bin/python -m pip install --upgrade pip

venv/bin/python -m pip install -r requirements.txt

```

Start the application:

```bash

venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --lifespan on --log-level info

```

### Windows 11 / Windows 10 (PowerShell)

Install Python 3.11 or newer from [python.org](https://www.python.org/downloads/windows/). Make sure the Python launcher is available, then verify the installation:

```powershell

py --list

```

Create the virtual environment and install the dependencies:

```powershell

py -3.11 -m venv venv

.\venv\Scripts\python.exe -m pip install --upgrade pip

.\venv\Scripts\python.exe -m pip install -r requirements.txt

```

If Python 3.11 is not installed, replace `-3.11` with an installed supported version shown by `py --list`.

Start the application:

```powershell

.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --lifespan on --log-level info

```

Open `http://127.0.0.1:8011/` in a modern browser.

These commands call the virtual environment's Python executable directly, so PowerShell virtual-environment activation and changes to execution policy are not required. Windows Terminal, PowerShell, and the native Windows Python installation are sufficient; WSL2 and a virtual machine are not required.

Windows users may optionally configure Video Editor to start at user logon with Windows Task Scheduler. No separate Windows service program is required; see [Windows Auto-Start](docs/WINDOWS_AUTOSTART.md) for registration and removal instructions.

### macOS (Intel / Apple Silicon)

Install a compatible Python 3.11 or newer, then run:

```bash

python3 -m venv venv

venv/bin/python -m pip install --upgrade pip

venv/bin/python -m pip install -r requirements.txt

venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --lifespan on --log-level info

```

### Verify the Installation

While the server is running, open:

- `http://127.0.0.1:8011/healthz` — should return `ok`.

- `http://127.0.0.1:8011/` — should display the full editor.

- `http://127.0.0.1:8011/static/ffmpeg/ffmpeg-core.wasm` — should serve the bundled WebAssembly asset.

The health endpoint and editor page loading do not by themselves verify successful video encoding. For functional verification, select a short supported video, perform a trim, run processing, and confirm that the output can be downloaded.

### Development Dependencies

For Python development and testing, install the project with its optional test dependencies:

Linux / macOS:

```bash

venv/bin/python -m pip install -e '.[test]'

```

Windows PowerShell:

```powershell

.\venv\Scripts\python.exe -m pip install -e ".[test]"

```

SQLite support is provided by the Python standard library when the Python installation includes the `sqlite3` module.

## Configuration

The application can start without a project-level `.env` file. **Check which environment file your deployment actually loads:** the documented project example is `.env`, while the existing Video Editor deployment discussed for STT uses `data/config/env/video-editor/.env`. A file on disk has no effect unless the running process loads it. Restart or reload the managed service after changing its active configuration.

To customize the configuration, copy the example:

Linux / macOS:

```bash

cp .env.example .env

```

Windows PowerShell:

```powershell

Copy-Item .env.example .env

```

Review the available settings before deployment. The default configuration binds to `127.0.0.1:8011` and allows `localhost` and `127.0.0.1` as trusted hosts. For native Windows installation, the default database path is preferable to manually constructing an absolute Windows drive-letter URL.

| Variable               | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `APP_NAME`             | Application name                                                            |
| `APP_ENV`              | Application environment                                                     |
| `APP_DEBUG`            | Debug configuration                                                         |
| `APP_HOST`             | Application bind address                                                    |
| `APP_PORT`             | Application port                                                            |
| `DATABASE_URL`         | SQLite database connection URL                                              |
| `CORS_ORIGINS`         | Explicitly permitted cross-origin requests                                  |
| `TRUSTED_HOSTS`        | Allowed HTTP Host values                                                    |
| `LOG_LEVEL`            | Application logging level                                                   |
| `PRESET_WRITE_ENABLED` | Enables custom preset write operations                                      |
| `PRESET_WRITE_KEY`     | Authentication key for custom preset writes                                 |
| `STT_BASE_URL`         | Optional Shared STT service base URL (for example, `http://127.0.0.1:8765`) |
| `STT_API_KEY`          | Backend-only API key for Shared STT; never expose to browser code           |

Environment variables take precedence over values loaded from `.env`.

### Optional Shared STT Service

Automatic Subtitles requires an independently deployed, reachable Shared STT backend. It is **not** required for ordinary browser-based video editing, merging, or manual subtitle editing.

1. Configure `STT_BASE_URL` and one valid `STT_API_KEY` in the **active Video Editor backend environment**, not in frontend JavaScript or public HTML. If the Shared STT service supports multiple `key:client` entries in `STT_API_KEYS`, set `STT_API_KEY` to **only the raw key** for one entry, without the `:client` suffix or an entire comma-separated list.
2. Confirm that the Video Editor server can reach the STT backend and that the backend process has loaded the settings. The STT service's own `STT_UI_PASSWORD` is for its separate web UI, not API-to-API authentication.
3. Keep the upstream service bound to a private interface or otherwise restrict access. Use HTTPS and network controls when the connection crosses untrusted networks.
4. Re-test submission, job polling, result retrieval, cancellation, review, Apply/Discard, and the final subtitle MP4 after configuration.

The Video Editor backend exposes these STT adapter endpoints:

| Method | Endpoint                               | Purpose                                            |
| ------ | -------------------------------------- | -------------------------------------------------- |
| POST   | `/api/stt/transcriptions`              | Submit source media and language for transcription |
| GET    | `/api/stt/jobs/{editor_job_id}`        | Read transcription job status                      |
| GET    | `/api/stt/jobs/{editor_job_id}/result` | Retrieve transcription result                      |
| POST   | `/api/stt/jobs/{editor_job_id}/cancel` | Request job cancellation                           |

The adapter sends the upstream `X-API-Key` header on the server side. Its editor-facing job identifiers are opaque and stored in process-local state, so restarts or multiple independent workers may affect lookup and job continuity. The STT upload path has a separately documented **500 MiB file limit**; it is not covered by the ordinary 64 KiB JSON recipe request limit. The deployment must also account for request-body limits and timeouts in the reverse proxy.

**Security consideration:** The Video Editor STT endpoints do not provide a separate user login. An accessible endpoint can therefore consume STT compute resources. Restrict access, add suitable request-rate and concurrency controls, and consider deployment-level authentication before exposing STT publicly. Do not mistake unguessable job IDs for user-level authorization.

### Database

The default database location is:

```text

data/video_editor.sqlite3

```

The application uses SQLite for preset storage.

**Configure `DATABASE_URL` for your installation:** The absolute database path depends on where the project is installed. Set `DATABASE_URL` in the application's active environment configuration to match the actual path on your system. For example, on Linux:

```dotenv
DATABASE_URL="sqlite:////ProjectRoot/video-editor/data/video_editor.sqlite3"
```

Replace `/ProjectRoot/video-editor` with the actual absolute project directory. This is an example path, not a universal installation path. For native Windows installations, prefer the default project-relative database location unless you have configured an appropriate SQLite URL for your Windows path.

The database directory is created at startup when necessary. The application account must have the required filesystem permissions.

Missing tables are initialized automatically, but existing database schemas are not automatically migrated.

For live database backups, use SQLite's online backup functionality rather than copying an active database file without coordinating writes.

### Security

- Keep `.env` files and authentication keys private.

- Do not commit secrets or production databases to Git.

- Restrict `CORS_ORIGINS` to trusted origins when cross-origin access is required.

- Configure `TRUSTED_HOSTS` appropriately for production.

- Use HTTPS through a trusted reverse proxy.

- Keep FFmpeg WebAssembly assets available from the application origin.

- Never expose `PRESET_WRITE_KEY` in client-side code.

CORS is disabled by default unless explicitly configured.

Custom preset write operations are disabled by default.

## Running the Application

### Development

On Linux and macOS, start the development server using the existing Bash script:

```bash

./tools/dev-server.sh

```

Alternatively, run Uvicorn directly:

```bash

venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --reload --reload-dir app --lifespan on --log-level info

```

On Windows PowerShell, run Uvicorn directly instead of the Bash-only `tools/dev-server.sh`:

```powershell

.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --reload --reload-dir app --lifespan on --log-level info

```

`--reload` is intended for development, not production.

Open the editor:

```text

http://127.0.0.1:8011/

```

### Production

Use a production process manager and an HTTPS reverse proxy.

An example systemd unit is available at:

```text

deploy/uvi.video-editor.service

```

Review its paths, service account, environment configuration, permissions, and network settings before using it.

The example configuration is not a universal production configuration.

On Windows, the systemd unit does not apply. Use a Windows-compatible process or service manager for persistent hosting, and configure HTTPS, firewall rules, trusted hosts, and process permissions as appropriate. For local-only use, the direct Uvicorn command is sufficient.

For virtual machines or remote clients, binding to `127.0.0.1` only permits access within the guest or host itself. Remote access requires an intentional bind address, suitable firewall and VM networking rules, and an updated `TRUSTED_HOSTS` configuration. Do not expose a development server directly to the public internet.

The current repository also contains demo-specific URLs in the canonical HTML metadata, `robots.txt`, and `sitemap.xml`. Operators deploying under another domain should review these values; changing `APP_HOST` or `TRUSTED_HOSTS` does not automatically rewrite them.

## Application Routes

| Route      | Description                         |
| ---------- | ----------------------------------- |
| `/`        | Landing page and editor entry point |
| `/t/app`   | Full video editor                   |
| `/t/min`   | Minimal editor                      |
| `/t/merge` | Multi-file video merge interface    |
| `/healthz` | Health check endpoint               |

## API Overview

The backend provides recipe validation, processing plans, preset management, and an optional STT adapter. Video editing and encoding run in the browser, including background audio mixing; speech recognition runs in the separately configured STT service.

| Method | Endpoint                    | Description                                                                                                                                                                                                          |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/healthz`                  | Health status                                                                                                                                                                                                        |
| GET    | `/api/presets`              | List built-in and stored presets                                                                                                                                                                                     |
| POST   | `/api/recipe/validate`      | Validate a video editing recipe                                                                                                                                                                                      |
| POST   | `/api/plan`                 | Generate FFmpeg arguments and output information, including playback speed, video fade, video transitions, color adjustment, text, subtitle, and image overlays, motion keyframes, audio mixing, and audio keyframes |
| POST   | `/api/merge/plan`           | Validate a merge request, including optional file-boundary transitions, and generate its browser-side processing plan                                                                                                |
| POST   | `/api/presets/custom`       | Create a custom preset                                                                                                                                                                                               |
| DELETE | `/api/presets/custom/{key}` | Delete a custom preset                                                                                                                                                                                               |

Recipe validation and plan generation use a request structure containing `meta` and `recipe` data.

Playback Speed, optional `video_fade`, optional `video_transitions`, optional `color_adjustment`, Text Overlay with optional per-overlay motion settings, optional subtitle settings, and optional `audio_mix` and `audio_keyframes` settings are included in the editing recipe and validated by the backend. Audio Mix uses a browser-side file reference; selected audio bytes are not sent to the plan API. Merge plan requests use their own input models and constraints. The merge API generates a plan; it does not upload or transcode source video files on the server.

Custom preset write endpoints require both:

- `PRESET_WRITE_ENABLED=true`

- A configured `PRESET_WRITE_KEY` supplied through the `X-App-Key` request header

The ordinary JSON API request body limit is 64 KiB. The separate STT multipart upload endpoint supports a larger bounded request (up to 500 MiB of media) and requires corresponding reverse-proxy limits.

The application does not provide server-side video transcoding endpoints. **Automatic Subtitles is an exception to the no-upload description:** the STT adapter receives media for speech recognition, not for video transcoding.

## Privacy and File Processing

Video Editor is designed to process selected source media locally within the browser.

In the current frontend implementation:

- Selected source files are accessed through browser file APIs.

- FFmpeg WebAssembly processes media in the browser.

- Text Overlay, Subtitle Editor, Image Overlay, and Motion Keyframes compositing, Video Fade, Video Transitions, Color Adjustment, background audio mixing, audio keyframe automation, and multi-file merging are performed in the browser; the backend validates configurations and produces processing plans.

- The backend receives recipe-related data for validation and plan generation.

- For normal editing and exporting, the backend does not receive selected source videos, image overlay files, or background audio files through a dedicated upload endpoint. **When Automatic Subtitles is requested, selected media is uploaded to the backend and forwarded to the configured STT service.**

- SQLite stores application preset data.

- Automatic Subtitles sends media to the configured STT backend. Storage, logging, temporary files, retention, and deletion at that service depend on its own implementation and deployment policy; this README does not guarantee immediate deletion or zero retention.

These statements describe the application's current implementation, not a guarantee about every possible deployment environment.

Reverse proxies, hosting infrastructure, browser extensions, third-party services, and future application changes may affect data handling.

Users deploying the application should review their own infrastructure and privacy requirements.

## Testing

### Python Tests

Install the test dependencies:

```bash

venv/bin/python -m pip install -e '.[test]'

```

Run the Python test suite:

```bash

PYTHONPATH=. venv/bin/python -m pytest -q

```

On Windows PowerShell:

```powershell

.\venv\Scripts\python.exe -m pytest -q

```

Check Python syntax:

```bash

venv/bin/python -m compileall -q app tests

```

Check installed Python dependencies:

```bash

venv/bin/python -m pip check

```

Windows PowerShell equivalents:

```powershell

.\venv\Scripts\python.exe -m compileall -q app tests

.\venv\Scripts\python.exe -m pip check

```

### JavaScript Tests

The JavaScript unit tests use Node.js directly and do not require Playwright:

```bash

for test in tests/test_*.mjs; do node "$test"; done

```

On Windows PowerShell, run the test files with:

```powershell

Get-ChildItem tests/test_*.mjs | ForEach-Object { node $_.FullName }

```

The equivalent package scripts are available for the named unit tests:

```bash

npm run test:timeline

npm run test:shortcuts

npm run test:theme

npm run test:i18n

npm run test:filename

```

The repository also contains Playwright configuration and an optional browser E2E script. Install the declared Node.js development dependencies only when you intend to run those browser tests.

### Optional Browser E2E Tests

The repository includes Playwright-related configuration and browser test infrastructure.

Browser E2E testing is optional and requires a compatible environment with the necessary browser dependencies. The browser binaries are not part of the normal application runtime.

Refer to the repository's test configuration for the applicable scripts and prerequisites.

Browser tests are not required to start or use the editor.

### OpenAPI Type Generation

`tools/openapi-types.sh` regenerates `app/web/src/api/schema.ts` when the separately installed `openapi-typescript` command is available. It uses the local development schema by default:

```bash

OPENAPI_URL=http://127.0.0.1:8011/openapi.json ./tools/openapi-types.sh

```

Set `OPENAPI_TYPESCRIPT_BIN` when the command is installed under a non-standard name or path. The script does not download packages or contact the public demo unless an explicit `OPENAPI_URL` is supplied.

## Limitations

### Local Project Persistence and Recovery

- Deleting a saved project is intentionally different from clearing the active editing session. The saved-project delete command leaves the active session and recent-work recovery available.
- Recent-work recovery is a single latest record per editor screen, not a complete backup or multi-version history.
- IndexedDB storage may be cleared, evicted, or become unavailable; browser-local recovery is not guaranteed.
- Concurrent modifications across browser tabs are not fully protected against conflicts.
- Local source files may need to be reselected when restoring an exported JSON configuration.
- The recently reported save/delete/recovery changes have not been runtime-verified in the scope of this documentation update.

### Automatic Subtitles Limitations

- Requires a configured and reachable Shared STT backend; manual subtitles and SRT/WebVTT import do not.
- Transfers source media outside the browser to the Video Editor backend and Shared STT service; do not describe this workflow as entirely local or upload-free.
- The editor offers `auto`, `ko`, and `en` recognition options. Speech recognition accuracy, punctuation, speaker separation, and subtitle timing depend on source audio and the STT model.
- Generated cues must pass Subtitle Editor limits and may require manual review, correction, or reduction before applying.
- Process-local job mappings may not survive server restarts or scale across multiple workers without shared state.
- The initial `503` configuration error was resolved. The tested deployment subsequently completed transcription and subtitle review/application with preview. Successful MP4 export containing those generated cues remains to be verified.

### Rotation and Fixed Canvas Limitations

- Rotation and fixed-canvas output should be verified against source orientation metadata, SAR/DAR, Crop, Scale, and the actual encoded frame dimensions.
- A fixed canvas is not equivalent to Keep aspect ratio: the latter may produce smaller dimensions within the requested bounding box.
- Overlay placement and subtitle alignment should be checked after rotation or output-frame changes.
- Exact filter order, fill behavior, recipe fields, and manual export verification are not established by the supplied original README.

### Browser Compatibility

Browser support depends on WebAssembly, Web Workers, media APIs, and available codecs.

Not all browser and operating-system combinations have been verified. In particular, native Windows 11 installation and end-to-end FFmpeg WASM processing should be confirmed on a real Windows host before claiming full Windows compatibility.

### Memory and File Size

Media processing uses browser and device resources.

Background music adds an audio input and decoding/mixing work to the browser-side processing pipeline. Text Overlay and Subtitle Editor may allocate transparent PNG assets for timed compositing. Image Overlay also prepares image assets for the FFmpeg WebAssembly virtual filesystem; motion-enabled text and image overlays additionally prepare transparent PNG frame sequences, subject to 1,200-frame, 4-million-output-pixel, and 128-MiB-PNG-data limits; multiple overlays and large output dimensions can increase memory use. Color Adjustment preview also uses browser GPU resources. Multiple overlays and high-resolution source files can increase browser memory usage. The merge UI currently caps combined input size at 2 GiB.

Large source files, high-resolution video, and complex operations may exceed available memory or processing limits.

### Processing Performance

Encoding performance depends on the source media, selected output settings, device hardware, and browser environment.

Processing can be significantly slower for long or high-resolution videos.

### Output Compatibility

Supported output containers and audio formats depend on the FFmpeg build and selected codecs.

Generating a file successfully does not guarantee that every browser can preview or play it.

### Playback Speed Limitations

- Playback Speed applies one speed value to the edited video, not separate speeds for individual segments.

- Supported speeds range from **0.25× to 4.0×**. The original audio changes tempo with the video, while Background Music remains at normal speed.

- The output-time track provides an estimated duration. Encoded media duration may differ slightly because of frame boundaries and timestamps.

- Existing saved Text Overlay timings created under the earlier source-time convention may need adjustment because the speed-aware editor uses output-time coordinates.

### Video Fade Limitations

- Video Fade applies only to the final video picture; it does not fade original audio or Background Music.

- Fade In and Fade Out transition to or from **black**. Custom colors, easing curves, and per-segment fades are not part of Video Fade; separate clip-boundary transitions are available through Video Transitions v1.0.

- Each Fade duration is limited to **0–10 seconds**. Enabled durations must not overlap: their sum cannot exceed the final edited output duration.

- Video Fade is available in the full single-video editor (`/t/app`). Video Merge (`/t/merge`) instead supports configurable transitions between adjacent files.

- Browser preview and encoded MP4 may differ slightly at exact frame boundaries due to decoding, encoding, and timestamps.

- The operator has confirmed the **Remove Segments + Video Fade** combination in actual MP4 output. This does not establish that every possible feature combination or environment has been verified.

### Video Transitions Limitations

- Video Transitions v1.0 supports Crossfade, Fade Through Black, Wipe Left, and Wipe Right at eligible retained-segment boundaries in `/t/app` and adjacent-file boundaries in `/t/merge`. It is not documented as available in `/t/min`.
- Active durations range from **0.1 to 3.0 seconds**. Invalid, duplicate, or overlapping boundary configurations that exceed available neighboring clip durations are rejected.
- Each active transition overlaps adjacent clips and shortens the estimated output duration. Encoded MP4 duration may differ slightly because of frame-rate conversion, timestamps, and audio/video stream boundaries.
- `/t/app` uses an approximate auxiliary-video transition preview. Short transitions, rapid seeking, variable frame rate, or Crop/Scale combinations can produce preview timing or appearance differences from the encoded MP4.
- `/t/merge` provides a silent, visual-only Canvas preview for one selected file boundary at a time. Browser decoding, seeking, scaling, and frame timing may make it unavailable or cause differences from the encoded transition; original audio and audio crossfades are heard only in the exported MP4. Preview failure does not itself invalidate an otherwise valid merge plan.
- Video Merge Transition Preview v1.0 source implementation is complete, but operator verification of preview playback, seeking, state invalidation, error handling, and MP4 visual agreement is pending. This is separate from the already verified multi-transition MP4 export.
- The operator completed the reported `/t/app` transition-type and combination checks and the `/t/merge` multi-transition MP4 output check. These do not establish compatibility with every source codec, browser, device, audio configuration, or maximum-size input.
- One `/t/merge` output was estimated at **13.023 seconds** and measured at **13.066 seconds** in the browser. The **43 ms** difference is recorded as an output-duration precision observation, not a confirmed processing defect.

### Color Adjustment Limitations

- Color Adjustment is available in the full single-video editor (`/t/app`), not in Video Merge (`/t/merge`) or the Minimal Editor (`/t/min`).

- One global set of Brightness, Contrast, Saturation, and Gamma values applies to the entire edited video. Per-segment grading, keyframes, LUTs, and automatic color correction are not included.

- The WebGL shader approximates FFmpeg `eq`; browser color management, pixel formats, and GPU behavior may produce visible differences between the preview and encoded MP4.

- If WebGL is unavailable or fails, the browser displays an unadjusted preview and a warning. The selected adjustment remains available for FFmpeg WebAssembly output; failure handling across all environments has not been independently verified.

- Color Adjustment does not modify audio, and the existing audio-extraction and PNG frame-capture operations retain their prior behavior.

- The nine manually verified scenarios do not establish compatibility across all browsers, codecs, operating systems, hardware, or extreme parameter combinations.

### Subtitle Editor Limitations

- Subtitle Editor v1.0 is available in `/t/app` only, not `/t/merge` or `/t/min`.
- One subtitle track is supported, with at most **100 cues**, **two lines per cue**, and **160 characters per cue**. Cue timing is based on the final output timeline; overlapping cues and out-of-range times are rejected.
- SRT and WebVTT import is supported, but complete WebVTT styling, ASS/SSA, and multiple independent subtitle tracks are outside the v1.0 scope.
- Subtitle text is composited into the video picture rather than documented as a selectable soft-subtitle track.
- Subtitle rendering depends on browser-available fonts. Exact appearance and timing may differ at encoded frame boundaries.
- Subtitle compositing is omitted from the audio-extraction and separate PNG frame-capture workflows.
- Browser Canvas PNG generation and FFmpeg WebAssembly compositing use additional memory and processing resources.
- The operator reported **15/15 PASS** in the specified manual checks. Compatibility with every browser, font, codec, and device has not been established.

### Image Overlay Limitations

- Image Overlay v1.0 is available in the full single-video editor (`/t/app`), not the Video Merge (`/t/merge`) or Minimal Editor (`/t/min`) interfaces.

- Supported image formats are PNG, JPEG, and WebP, with a maximum of **10 image overlays**. Each selected image is limited to **20 MiB**; browser decoding and memory limits may impose additional restrictions.

- Position and width use output-frame-relative coordinates, and images preserve their aspect ratio. Rotation, perspective transforms, and image cropping are outside the v1.0 scope.

- Timing is relative to the final edited output timeline. Invalid intervals or out-of-frame placement prevent processing until corrected.

- Presets save image metadata rather than local image bytes. Missing image files must be reselected before processing; restoring a preset does not automatically restore access to files from a previous browser session.

- When Crop is combined with Image Overlay, the browser preview may still show portions of the original frame outside the cropped region. Final output placement should be checked in the downloaded MP4.

- Large output frames and multiple image overlays can exceed available browser or FFmpeg WebAssembly memory.

- The **13/13 PASS** manual verification covers the reported workflows. It does not include every browser, operating system, codec, maximum-count scenario, malformed image, memory-limit case, or Crop combination.

### Motion Keyframes Limitations

- Motion Keyframes v1.0 applies to individual Text Overlay and Image Overlay items in `/t/app` only; it is not implemented in `/t/merge` or `/t/min`.
- Animated properties are X/Y position, scale, and opacity with linear interpolation. Keyframe times follow the final edited output timeline. Timeline markers support selection, but not drag-to-change-time editing.
- Motion-enabled overlays require browser-side Canvas PNG frame preparation and FFmpeg WebAssembly compositing. Static overlays retain the existing non-motion path.
- PNG preparation is limited to **1,200 frames**, **4 million output pixels**, and **128 MiB of PNG data**. These limits do not guarantee that processing will succeed on every device.
- Undo/Redo and presets retain motion metadata, but image files themselves are not saved in presets and may need to be reselected.
- Browser preview and encoded MP4 may differ at frame boundaries or because of font rendering and resource constraints. Actual MP4 output and combinations have not yet been manually verified by the operator.

### Audio Keyframes Limitations

- Audio Keyframes v1.0 is available only in `/t/app`, with separate original-audio and background-music automation tracks.

- Each track supports at most **100 keyframes**, with unique integer-millisecond times within the final output duration and volume values from **0% to 200%**. Values are linearly interpolated, with endpoint values held outside the defined range.

- FFmpeg evaluates gain on audio frames; precise audible boundaries may differ slightly from browser preview. When Web Audio is unavailable, the editor warns that preview automation is limited; some environments may not represent gains above 100% accurately in preview.

- Mute overrides automation, and Extract does not apply it. Background music fades remain in effect alongside automation.

- Presets retain automation settings but not the local background music file itself; the file may need to be reselected.

- Source implementation is complete, but actual Audio Keyframes MP4 output has not yet been manually verified by the operator.

### Background Music Limitations

- The initial implementation supports one background music file per edit, not multiple simultaneous music tracks.

- Background music does not loop automatically and stops at the output video boundary.

- The **Extract** mode retains the original audio extraction workflow and does not export the mixed soundtrack.

- The **Mute** mode silences the final output, including any selected background music.

- Browser audio decoding, playback synchronization, FFmpeg WASM processing, and available memory may vary by device, browser, and input format.

### Editing State

Automatic restoration of unsaved editing state after a page refresh is not guaranteed. Selected local background audio files and image overlay files may need to be selected again after a reload.

### API Limits

Text Overlay validation limits include up to 20 overlays and 500 characters per text item. Motion Keyframes add per-overlay timing and property validation and browser-side PNG preparation limits. Subtitle Editor validation limits include up to 100 cues, two lines and 160 characters per cue, and non-overlapping output-time intervals. Image Overlay supports up to 10 images with validated timing, positioning, sizing, opacity, and file metadata. Overlay start/end times, coordinates, and style values are validated. Merge limits are documented under **Video Merge** above.

The recipe models define validation limits, including:

- Maximum declared video duration: 24 hours

- Maximum resolution dimension: 16,384 pixels

- Maximum number of removed segments: 200

These are input-validation limits, not guarantees that media at those limits can be processed successfully.

### Feature Verification

**Automatic Subtitles — transcription and cue application verified; MP4 export pending:** Following resolution of an initial STT configuration error, the operator observed a successful `202` submission, `200` polling and result responses, and two Korean cues applied and visible in the browser preview. Export of an MP4 containing these newly generated cues has not yet been confirmed.

**Rotation and Fixed Output Canvas — additional implementation reported; output verification not established:** Check browser preview, generated plan, encoded dimensions, and interactions with Crop, Scale, overlays, and subtitles before claiming verified results.

**Motion Keyframes v1.0 — source implementation complete; operator manual verification pending:** Per-overlay X/Y position, scale, opacity, linear interpolation, output-time preview and keyframe selection, browser-side PNG-frame preparation and FFmpeg WASM composition, recipe validation, Undo/Redo, and presets are implemented according to the development report. Actual animated MP4 output, preview/export consistency, existing-feature combinations, and cancellation/retry have not yet been manually confirmed.

**Subtitle Editor v1.0 — implementation and reported manual verification complete (15/15 PASS):** The operator confirmed cue editing and preview, English/Korean rendering, SRT/WebVTT import, MP4 compositing, validation, Undo/Redo and presets, combinations with existing editing features, and cancellation/retry. These are operator-reported checks, not automated or cross-platform certification.

**Audio Keyframes v1.0 — source implementation complete; operator manual verification pending:** Two independent automation tracks, output-time keyframes, linear interpolation, graph/numeric editing, Web Audio preview, FFmpeg WASM processing, frontend/backend validation, Undo/Redo, and presets are implemented according to the development report. Actual MP4 audio automation has not yet been manually confirmed.

**Video Transitions v1.0 — design and reported manual verification complete:** The operator verified actual MP4 output for **4/4 transition types** (Crossfade, Fade Through Black, Wipe Left, Wipe Right) in `/t/app`, plus **10/10 reported combination and workflow checks** (Playback Speed, Video Fade, Color Adjustment, Text Overlay, Image Overlay, Background Music, Original Audio, Multiple Transitions, Undo/Redo plus Preset, and Validation plus Cancellation). The operator additionally confirmed **multi-transition MP4 output** in `/t/merge`, with the generated MP4 successfully loaded in the browser. This is a report of the operator's tested scenarios, not an automated or cross-platform certification.

**Image Overlay v1.0:** The project operator reported **13/13 PASS** in manual verification: PNG/JPEG/WebP loading and preview; transparent PNG alpha; dragging and corner resizing; position, width, and opacity; start/end timing; multiple-image stacking order; standalone MP4 export; MP4 export combined with Color Adjustment, Text Overlay, Video Fade, and Remove Segments; and Undo/Redo plus preset restoration. No failures were reported in these 13 checks. The result is limited to these tested workflows.

**Color Adjustment v1.0:** The operator reported nine successful manual checks: Brightness `0.30`, Contrast `1.50`, Saturation `0.00`, and Gamma `1.50` in browser preview and actual MP4 output; Reset; MP4 output combined with Text Overlay, Video Fade, and Remove Segments; and Undo/Redo plus Preset restoration. No failures were reported in these nine checks.

The project operator has verified Text Overlay preview and final MP4 text compositing, Background Music / Audio Mix functionality and final output, Playback Speed at 2.0× and 0.5× (including original-audio synchronization and background music), the 0.25× and 4.0× custom limits, Playback Speed combinations with Remove Segments and Text Overlay, and **actual MP4 output combining Remove Segments with Video Fade** in the tested workflows. Other source codecs, browsers, fonts, operating systems, and resource-intensive edits may require separate verification. PNG frame capture is not documented as applying Text Overlay compositing.

## Output Resolution Guidance (v1.1.0)

The full editor (`/t/app`) provides source-metadata-based output size suggestions for 480p, 720p, and 1080p where applicable. Suggestions consider the source orientation, available display-aspect metadata, and the effective Crop region. Suggestions that would exceed the source pixel dimensions are omitted. Selecting a suggestion updates the existing Scale settings; suggestions do not change the recipe automatically.

| Source display shape | 480p target | 720p target | 1080p target |
| -------------------- | ----------- | ----------- | ------------ |
| 16:9 landscape       | 854 × 480   | 1280 × 720  | 1920 × 1080  |
| 9:16 portrait        | 480 × 854   | 720 × 1280  | 1080 × 1920  |

With **Keep aspect ratio** enabled **without Fixed Output Canvas**, the Scale width and height define a bounding box, not a padded output canvas. For example, a 7680 × 4320 landscape source with a 720 × 1280 Scale target has a **statically estimated** output size of 720 × 406. It is not stretched or padded to fill a portrait frame in that mode. Fixed Output Canvas is a separate output-framing option and must be tested independently. With aspect-ratio preservation disabled, the specified dimensions can alter the picture's shape.

The processing plan uses FFmpeg's `force_original_aspect_ratio=decrease:force_divisible_by=2` for aspect-preserving scaling. Crop dimensions are normalized to even values, while `crop=...:exact=1` allows the selected integer X/Y coordinates to be honored where supported. The expected output size shown in the UI is a calculation, not a measurement of an encoded file. SAR, DAR, rotation metadata, and browser-reported dimensions can differ; inspect the output file for unusual sources.

**Verification status:** A previous browser export failed when `libx264` received a 720 × 405 frame. The current plan is statically expected to produce 720 × 406 for the example above, but the corrected case has **not yet been confirmed by a new browser export**. Do not treat this static result as proof of successful encoding.

### Project State and Output Checks

- The full editor's resolution recommendation selection and manual Scale/Crop changes are reported to update the normalized recipe used for project saving. Verify persistence by saving, reloading, and restoring a project before relying on it for critical work.
- The browser-local saved-project and recent-work mechanisms remain distinct from SQLite-backed server presets. Exported project JSON carries editing settings and media references rather than embedding source video bytes; restoring a project may require selecting the original files again.
- For release verification, compare the Scale target, UI's expected output dimensions, generated FFmpeg arguments, encoded file dimensions, and playback. Important manual cases include 7680 × 4320 → 1280 × 720, 7680 × 4320 with a 720 × 1280 target → 720 × 406, and 1080 × 1920 → 720 × 1280 or 480 × 854. These are **expected values**, not newly verified exports.
- When Crop and Image Overlay are combined, verify placement against the post-Crop output frame. Sources with non-square SAR or 90°/270° rotation metadata need separate browser and encoded-file checks.

## Deployment Notes

For production deployments:

1. Use a dedicated application service account.

2. Restrict filesystem permissions for configuration and database files.

3. Configure a reverse proxy with HTTPS.

4. Set appropriate trusted hosts and CORS origins.

5. Keep private configuration outside the public web root.

6. Ensure the browser can load the required FFmpeg WebAssembly assets.

7. Configure logging and database backups.

8. Validate functionality in the target browser.

9. On Windows, use a Windows-compatible service manager instead of the Linux systemd example.

10. Review demo-specific canonical, robots, and sitemap URLs when deploying on another domain.

Do not expose the application development server directly to the public internet without an appropriate deployment configuration.

## Upgrade Notes: v1.0.0 to v1.1.0

1. Back up the existing configuration, SQLite preset database, and any exported project JSON files before upgrading.
2. Deploy the source revision that contains rotation, fixed canvas, and the STT adapter; updating this README alone does not install features.
3. Leave `STT_BASE_URL` and `STT_API_KEY` unset if Automatic Subtitles is not required. If enabled, set them in the environment actually loaded by the Video Editor process and restart that process.
4. Keep STT API credentials server-side. Confirm upstream connectivity, request-body limits, reverse-proxy timeouts, and appropriate access restrictions before allowing media uploads.
5. Smoke-test the full editor, merge interface, existing saved projects, and a short browser-side MP4 export. Separately verify rotation and fixed-canvas encoded dimensions, and inspect an exported MP4 with newly generated STT cues before considering those paths production-validated.
6. Do not assume an existing SQLite schema will migrate automatically; review any schema changes associated with the actual code revision.

## Release and Documentation Scope

The initial `v1.0.0` release was published on **November 15, 2026**. This README describes the **v1.1.0** feature set, including subsequent rotation, fixed output canvas, and Automatic Subtitles work. The v1.1.0 designation is a proposed version update for the documented additions; it does **not** independently verify a published Git tag, distribution archive, or production deployment. Check the actual repository revision and deployed build before advertising these features as shipped. STT transcription, cue application, and browser preview were verified in a specific test on November 16, 2026; exported MP4 with those newly generated cues remains unverified. Statements marked as operator-reported or pending must not be interpreted as automated tests or universal compatibility certification.

## License

This project is licensed under the **MIT License**.

Copyright (c) 2026 Glitter.kr

See [LICENSE](LICENSE) for the complete license text.

Third-party components, including FFmpeg and FFmpeg WebAssembly, remain subject to their respective licenses.

---

**Video Editor** — Browser-based video editing powered by FFmpeg WebAssembly.

Website: [Glitter.kr](https://glitter.kr)

Live Demo: [vedit.glitter.kr](https://vedit.glitter.kr)

---
