import { Request, Response } from 'express';
import { LumosDatastore } from 'lumostrade';

export default async function userSettingsRequest(req: Request, res: Response) {
  const page = req.query.page as string;
  if (!page) {
    return res.status(400).json({ error: 'Page parameter is required' });
  }

  const datastore = new LumosDatastore();

  if (req.method === 'GET') {
    try {
      const settings = await datastore.Get(page);
      return res.json(settings || { bookmarks: [] });
    } catch (error) {
      console.error('Error fetching user settings:', error);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
  } else if (req.method === 'POST') {
    try {
      const bookmarks = req.body;
      await datastore.Set(page, bookmarks);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error saving user settings:', error);
      return res.status(500).json({ error: 'Failed to save settings' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
