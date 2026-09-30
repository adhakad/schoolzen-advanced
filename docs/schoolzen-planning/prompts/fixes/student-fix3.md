# Fix: Student photo upload — "folder path doesn't exist" on Cloudinary upload

## The bug

Student photo upload fails with a missing/non-existent-folder error.
This is almost always a **local temp-upload path** problem, not
Cloudinary itself — Cloudinary auto-creates its own remote folder
(`schoolzen/{adminId}/students/...`, per
`docs/schoolzen-planning/v1/_core/additional-technical-considerations.md`'s
File storage section) on first upload; it never needs to pre-exist.

The real cause: the upload middleware uses `multer.diskStorage(...)`
writing to a local folder (e.g. `uploads/students/`) that doesn't
physically exist on this server/deploy (a fresh clone or a fresh
container never has it — an empty folder isn't tracked by git).

## The fix — switch to `multer.memoryStorage()`

Removes the local-disk step entirely — no folder to create, no path to
get wrong, one less moving part between the request and Cloudinary.

**Find the multer config for the Student photo upload route** (wherever
`multer(...)` / `multer.diskStorage(...)` is wired for
Admission/Manage Students' photo field) and replace it:

```js
// BEFORE — disk storage, needs a pre-existing local folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/students'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });
```

```js
// AFTER — memory storage, no local folder at all
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // keep the existing size cap, or set one if missing
});
```

**In the controller**, upload the in-memory buffer directly to
Cloudinary via `upload_stream` (don't write it to disk first):

```js
const cloudinary = require('cloudinary').v2;

function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// in the route handler, after multer populates req.file:
const result = await uploadBufferToCloudinary(
  req.file.buffer,
  `schoolzen/${adminId}/students`
);
// result.secure_url -> save as Student.photoUrl
```

## Apply the same fix anywhere else `diskStorage` is used for an upload

This isn't Student-specific — check any other module with a file/photo
upload (Staff photo, Admission ID-proof documents, bulk Excel
Import/Export, CSV bulk-card-assign) for the same `diskStorage`
pattern and switch each to `memoryStorage()` too, per
`additional-technical-considerations.md`'s "File upload handling"
section (one shared upload component/service app-wide, not a one-off
per module) — don't leave this fixed only on the Student photo path
while the same bug still exists elsewhere.

## While touching this: apply the `f_auto,q_auto` transform (already documented, easy, free)

Per the same File storage section's "Easy, high-value win" note — when
saving/serving `Student.photoUrl` (or any Cloudinary image URL), use
Cloudinary's URL transform params so every consumer gets an optimized
image without a second upload or a paid feature:

```js
// requesting/storing the URL with transforms baked in:
cloudinary.url(result.public_id, {
  fetch_format: 'auto',   // f_auto — serves WebP/AVIF where supported
  quality: 'auto',        // q_auto — perceptually-tuned compression
  width: 300,             // match the largest real display size (profile view)
});
// for a table-row thumbnail elsewhere in the UI, request a smaller `width`
// (e.g. 40-60) rather than reusing the 300px URL and shrinking it with CSS.
```
