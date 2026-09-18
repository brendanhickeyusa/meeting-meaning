# Meeting Meaning

**Make sense of every conversation.**

A Windows desktop app that transcribes both sides of a meeting, explains technical terms in context, and builds a reusable local glossary. Works alongside Zoom, Google Meet, and other apps that play audio through Windows.

## Download and run

Download the **Windows x64 ZIP** from [Releases](https://github.com/brendanhickeyusa/meeting-meaning/releases). Extract the entire folder and open **MeetingMeaning.exe**. Keep the files together. Node.js and Codex are not required.

This is an unsigned early release for Windows 10/11 x64. An organizational security policy may require an approved installation. There is no automatic updater.

## First meeting

1. Open **Settings** and add a [Deepgram Speech-to-Text API key](https://console.deepgram.com/).
2. For new definitions, add a [Google AI Studio Gemini API key](https://aistudio.google.com/apikey). New installations select **Gemini 3.5 Flash-Lite**. Alternatively select OpenAI and supply an [OpenAI API key](https://platform.openai.com/api-keys).
3. Click **Test definitions** and then **Save settings**. **Refresh models** lists available Flash-Lite models if you need to change the selection. Different models have different prices; the app never switches automatically.
4. Use headphones. Make the meeting's playback device the Windows default. Select your microphone, give the meeting a title, and click **Start listening**.
5. Check that both audio indicators respond and that both sides appear in the transcript.
6. Click **Stop & save** when finished.

You can use **Try a sample meeting** without keys, audio capture, or API charges.

## What it does

- Separate microphone and Windows playback transcription, merged chronologically.
- Your microphone is labeled **You**; remote voices receive AI speaker labels. Click a speaker label to rename it for the meeting.
- **Term notebook** shows terms detected in the current meeting. Technical jargon, cybersecurity, acronyms, products, vendors, and data science are supported by the discovery prompt.
- **Glossary** searches and edits definitions collected across meetings. Known terms match locally without definition API calls.
- **Past meetings** reopens saved transcripts; their date and start time appear below Conversation in your local time zone.
- **Export** saves a full timestamped text transcript with speaker names. **Open saved files** provides the structured JSON records.

AI definitions start as unreviewed. The model is instructed to label ambiguous meanings **Uncertain:** and explanations based only on the dialogue **From this conversation:**. Those are model instructions, not independent factual verification. Review definitions before relying on them.

## Automatic versus manual definitions

**Learn new terms automatically** scans finalized transcript text every 10 seconds by default. **Find new terms** requests an immediate scan. Both count toward the default limit of **60 definition requests per meeting**; continuous speech can exhaust that limit after about 10 minutes. Adjust the interval or limit in Settings.

**Saved glossary only** makes no automatic definition requests; manual discovery is still available. A zero request limit disables both. Transcription continues to incur charges in either mode.

After a definition-service error, automatic discovery pauses while transcription continues. Fix the service settings and restart capture, or use **Find new terms** to retry. Diagnostics in Settings send one short sample sentence and no meeting content.

## Costs and services

Bring your own keys and billing accounts. Audio is sent to two Deepgram Nova-3 English streams; speaker diarization is enabled on the remote stream. Definition requests use the selected Gemini or OpenAI model. All displayed token counts are usage indicators, not an invoice. Consumer chat subscriptions do not cover API usage.

Check current [Deepgram pricing](https://deepgram.com/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), or [GPT-4.1 mini pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Free-tier access, quotas, and data-use terms vary. Stop listening to close the transcription streams.

## Local data and privacy

The app deliberately preserves its original profile at `%APPDATA%\meeting-companion`. This lets existing users retain their Windows-protected keys after the rename. Under `library`:

- `meetings/*.json`: finalized transcript segments, timestamps, speaker names, term references, usage, and session events.
- `glossary.json`: accumulated definitions and review status.
- `settings.json`: settings and encrypted API keys protected through Electron safeStorage on Windows.

Saved keys are not returned to the interface: the input boxes reopen blank and say **Key saved**. Leaving a box blank preserves its key; only the corresponding Remove checkbox deletes it. Transcripts and glossary files are readable local JSON, not encrypted by this app.

Audio goes to Deepgram while listening. Recent transcript text and relevant known term names go to the selected definition provider during discovery. No raw audio or screen video is retained by this app. Windows playback capture requires a display-capture track, but the app does not read, save, or upload the video.

Playback capture includes other applications' audio. Microphone capture is independent of Zoom/Meet's mute button. Only capture conversations you are authorized to transcribe.

Personal keys, transcripts, and glossary records are not included in the source or Windows release.

## Limits of this release

- Remote speaker labels can be wrong, especially for overlap, short utterances, similar voices, or shared microphones. Participant names are not obtained from the meeting platform.
- Capture uses the Windows playback mix; it does not isolate a specific app or separate individual remote speakers into audio tracks.
- A lost transcription connection stops capture and reports an error. There is no automatic reconnection or audio replay; unfinalized speech can be lost. Normal Stop allows up to four seconds for final results.
- Each discovery request considers at most the latest 20 unprocessed transcript segments and 6,000 characters, and returns at most five terms. Dense speech can result in missed terms.
- The app currently targets English transcription.

## Develop and package

Use Windows x64 and a current supported Node.js release with npm:

```sh
npm ci
npm test
npm start
npm run package
```

The build copies the installed Electron Windows runtime and app files into `../Windows/MeetingMeaning`. Preserve the runtime and dependency license notices when distributing it. The build script should be run on Windows x64.

Fourteen automated tests cover transcript handling, persistence, glossary matching, key preservation, provider requests/errors, model listing, and simulated UI interactions. Live transcription and Gemini definitions have been tried by the initial user; automated native desktop launch was blocked in the build environment, and broader device compatibility remains unverified.

## Source licensing

No open-source license has been granted for this application's source yet. Third-party components retain their own licenses; their notices are included in the Windows distribution.
