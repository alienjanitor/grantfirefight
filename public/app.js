// Small progressive enhancements. Every page works without this file.

// Keep in step with countChars in src/domain/charcount.ts
// (test/charcount.test.ts checks they agree).
function countChars(text) {
  let count = 0;
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    count += ch === "\n" ? 2 : 1;
  }
  return count;
}

function setupCounters() {
  for (const area of document.querySelectorAll("textarea[data-limit]")) {
    const limit = Number(area.dataset.limit);
    const out = document.getElementById(area.dataset.counter);
    if (!out) continue;
    const update = () => {
      const n = countChars(area.value);
      out.textContent = `${n.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")}`;
      out.classList.toggle("over", n > limit);
    };
    area.addEventListener("input", update);
    update();
  }
}

function setupCopyButtons() {
  for (const btn of document.querySelectorAll("button[data-copy]")) {
    btn.addEventListener("click", async () => {
      const target = document.getElementById(btn.dataset.copy);
      if (!target) return;
      const text = "value" in target ? target.value : target.textContent;
      try {
        await navigator.clipboard.writeText(text);
        const label = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = label), 1500);
      } catch {
        btn.textContent = "Select and copy manually";
      }
    });
  }
}

function setupBusyForms() {
  for (const form of document.querySelectorAll("form[data-busy]")) {
    form.addEventListener("submit", () => {
      for (const btn of form.querySelectorAll("button[type=submit], button:not([type])")) {
        btn.disabled = true;
        btn.textContent = form.dataset.busy;
      }
    });
  }
}

// Voice answers: record in the browser, transcribe on the server, and drop the
// text into the answer box so the chief can fix it before sending.
function setupRecorders() {
  for (const btn of document.querySelectorAll("button[data-record]")) {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      btn.hidden = true;
      continue;
    }
    const target = document.getElementById(btn.dataset.target);
    const status = document.getElementById(btn.dataset.status);
    let recorder = null;
    let chunks = [];
    btn.addEventListener("click", async () => {
      if (recorder && recorder.state === "recording") {
        recorder.stop();
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (status) status.textContent = "Microphone permission was denied.";
        return;
      }
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.addEventListener("dataavailable", (e) => chunks.push(e.data));
      recorder.addEventListener("stop", async () => {
        stream.getTracks().forEach((t) => t.stop());
        btn.textContent = "Record answer";
        if (status) status.textContent = "Transcribing…";
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        try {
          const res = await fetch(btn.dataset.record, {
            method: "POST",
            headers: { "content-type": blob.type },
            body: blob,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed.");
          target.value = (target.value ? target.value + " " : "") + data.text.trim();
          target.dispatchEvent(new Event("input"));
          if (status) status.textContent = "Check the text, then send.";
        } catch (err) {
          if (status) status.textContent = err.message;
        }
      });
      recorder.start();
      btn.textContent = "Stop recording";
      if (status) status.textContent = "Recording…";
    });
  }
}

setupCounters();
setupCopyButtons();
setupBusyForms();
setupRecorders();
