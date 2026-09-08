// Client routes — CRUD + deploy + gateway control

import { Router } from 'express';
import { listClients, getClient, createClient, updateClient, deleteClient, getClientTemplate } from '../services/client-service.js';
import { getGatewayStatus, startGateway, stopGateway, restartGateway, getGatewayLogs } from '../services/gateway-service.js';
import { deployClient } from '../services/deploy-service.js';

const router = Router();

// List all clients
router.get('/', (req, res) => {
  try {
    const clients = listClients();
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get client template
router.get('/template', (req, res) => {
  try {
    const template = getClientTemplate();
    res.json({ template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single client
router.get('/:slug', (req, res) => {
  try {
    const client = getClient(req.params.slug);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create client
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const client = createClient({ name, description });
    res.status(201).json({ client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update client
router.put('/:slug', (req, res) => {
  try {
    const { config, soulContent } = req.body;
    const client = updateClient(req.params.slug, { config, soulContent });
    res.json({ client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete client
router.delete('/:slug', (req, res) => {
  try {
    const result = deleteClient(req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Deploy client
router.post('/:slug/deploy', async (req, res) => {
  try {
    const result = await deployClient(req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gateway status
router.get('/:slug/status', (req, res) => {
  try {
    const status = getGatewayStatus(req.params.slug);
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start gateway
router.post('/:slug/start', (req, res) => {
  try {
    const result = startGateway(req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop gateway
router.post('/:slug/stop', (req, res) => {
  try {
    const result = stopGateway(req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restart gateway
router.post('/:slug/restart', async (req, res) => {
  try {
    const result = await restartGateway(req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gateway logs
router.get('/:slug/logs', (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    const logs = getGatewayLogs(req.params.slug, lines);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
