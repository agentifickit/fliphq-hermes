// Channel routes — WhatsApp + Slack Connect configuration

import { Router } from 'express';
import {
  getWhatsAppConfig,
  getGroupRouting,
  addWhatsAppGroup,
  removeWhatsAppGroup,
  listWhatsAppGroups,
  getSlackConnectConfig,
  addSlackConnectChannel,
  removeSlackConnectChannel,
  listSlackConnectChannels,
  getChannelStatus,
  testWhatsAppGroup,
  testSlackChannel,
} from '../services/channel-service.js';

const router = Router();

// ---------- WhatsApp ----------

// Get WhatsApp config for a client
router.get('/:slug/channels/whatsapp', (req, res) => {
  try {
    const config = getWhatsAppConfig(req.params.slug);
    const groups = listWhatsAppGroups(req.params.slug);
    res.json({ config, groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add WhatsApp group
router.post('/:slug/channels/whatsapp', (req, res) => {
  try {
    const { groupId, groupName } = req.body;
    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
    }
    const result = addWhatsAppGroup(req.params.slug, groupId, groupName);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove WhatsApp group
router.delete('/:slug/channels/whatsapp/:groupId', (req, res) => {
  try {
    const result = removeWhatsAppGroup(req.params.slug, req.params.groupId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test WhatsApp group
router.post('/:slug/channels/whatsapp/:groupId/test', async (req, res) => {
  try {
    const result = await testWhatsAppGroup(req.params.groupId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Slack Connect ----------

// Get Slack Connect config for a client
router.get('/:slug/channels/slack', (req, res) => {
  try {
    const config = getSlackConnectConfig(req.params.slug);
    const channels = listSlackConnectChannels(req.params.slug);
    res.json({ config, channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Slack Connect channel
router.post('/:slug/channels/slack', (req, res) => {
  try {
    const { channelId, channelName, workspace } = req.body;
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }
    const result = addSlackConnectChannel(req.params.slug, channelId, channelName, workspace);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove Slack Connect channel
router.delete('/:slug/channels/slack/:channelId', (req, res) => {
  try {
    const result = removeSlackConnectChannel(req.params.slug, req.params.channelId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test Slack channel
router.post('/:slug/channels/slack/:channelId/test', async (req, res) => {
  try {
    const result = await testSlackChannel(req.params.channelId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Channel Status (all) ----------

router.get('/:slug/channels', (req, res) => {
  try {
    const status = getChannelStatus(req.params.slug);
    res.json({ channels: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Router-wide WhatsApp routing table ----------

router.get('/whatsapp-routing', (req, res) => {
  try {
    const routing = getGroupRouting();
    res.json({ routing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
