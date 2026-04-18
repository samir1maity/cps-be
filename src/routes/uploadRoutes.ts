import { Router } from 'express';
import { presignUpload, signDownload } from '../controllers/uploadController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// Uploading requires auth; signing for download is public (product images shown to all users).
router.post('/presign', authenticate, presignUpload);
router.get('/sign{/*key}', signDownload);

export default router;
