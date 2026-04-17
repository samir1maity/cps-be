import { Router } from 'express';
import { presignUpload, signDownload } from '../controllers/uploadController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// All upload-related endpoints require a valid JWT — no anonymous uploads.
router.use(authenticate);

// Issue a signed PUT URL + key for a direct browser-to-S3 upload.
router.post('/presign', presignUpload);

// Issue a signed GET URL for a stored key so the browser can read a private object.
// path-to-regexp v8 (Express 5): {/*key} captures the full path including slashes.
// e.g. GET /sign/products/uuid-name.jpg → req.params.key = "products/uuid-name.jpg"
router.get('/sign{/*key}', signDownload);

export default router;
