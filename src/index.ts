import app from './app.js';
import { connectDB } from './config/database.js';
import { config } from './config/env.js';

await connectDB();

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
