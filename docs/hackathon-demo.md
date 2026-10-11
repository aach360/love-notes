# UNCitall hackathon demo

## 90-second story

**0–15 seconds:** “UNC events live across different calendars and club chats. UNCitall brings discovery, planning, and coordination together.” Open Discover and show the visible Filters dropdown.

**15–40 seconds:** “Tell Rameses what you’re looking for.” Ask “What’s free this weekend?” Open a real suggestion, save it, and add it to Calendar. Explain that listings come from imported sources and model event references are checked; saving is not an RSVP.

**40–60 seconds:** Open Calendar directly from navigation. Select the event date and show export. “Your shortlist becomes a schedule without switching tools.”

**60–85 seconds:** Open your club and post a message. The second participant shows the iMessage notification, replies with `CLUBCODE message`, and the reply appears in the web chat. “Members can participate from Messages, with opt-in delivery and private phone numbers.”

**85–90 seconds:** “Discover it. Plan it. Go together.”

## Two-person Photon acceptance test

This test is pending until a second participant is available. Do not present it as verified before completing it.

- Register both exact senders under Photon → PulseMatch → Users. Each person uses their assigned bot number.
- Both participants sign in, join the same club, generate their own link code, text `link CODE`, confirm their sender, and enable the club. Never share account-link codes in slides or recordings.
- Person A posts from the website. Person B receives the message in Messages. Record receipt and check the sender's own message is not echoed back to them.
- Person B replies `CLUBCODE Got it!`. Confirm it appears once in the web chat and arrives at Person A's phone.
- Leave Person A on the Clubs list, send another message from B, and check A's unread badge appears. Open the chat and return to verify the badge clears.
- Disable club texts and send a new message; verify no further club delivery. Re-enable only with the participant's consent.
- Test an opted-in plan reminder with a real upcoming timed event. All-day events have no timed reminders. Text STOP to verify delivery pauses.
- Keep the website and agent running. Provider timeouts are unknown deliveries, not automatic retries. Club messages expire after ten minutes.

## Before presenting

Check real listings, both authenticated sessions, correct timezone/date, Gemini response, Photon agent heartbeat, and a tested fallback recording. Do not show API keys, sender addresses, or link codes on the projector. If the live message test fails, describe the verified portions accurately and use the recording only if it is from a real successful test.
