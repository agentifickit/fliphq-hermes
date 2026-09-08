// MCP routes — REST API for client MCP tool management

import { Router } from 'express';
import {
  getAvailableTools,
  getClientMcpTools,
  addOrUpdateMcpTool,
  removeMcpTool,
  toggleMcpTool,
  testMcpTool,
} from '../services/mcp-service.js';

const router = Router();

// Get available tool templates
router.get('/mcp-tools/available', (req, res) => {
  try {
    const tools = getAvailableTools();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get client's MCP tools
router.get('/:slug/mcp-tools', (req, res) => {
  try {
    const tools = getClientMcpTools(req.params.slug);
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add or update MCP tool
router.post('/:slug/mcp-tools/:toolId', (req, res) => {
  try {
    const result = addOrUpdateMcpTool(req.params.slug, req.params.toolId, req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove MCP tool
router.delete('/:slug/mcp-tools/:toolId', (req, res) => {
  try {
    const result = removeMcpTool(req.params.slug, req.params.toolId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle tool enabled/disabled
router.post('/:slug/mcp-tools/:toolId/toggle', (req, res) => {
  try {
    const result = toggleMcpTool(req.params.slug, req.params.toolId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test MCP tool connection
router.post('/:slug/mcp-tools/:toolId/test', async (req, res) => {
  try {
    const result = await testMcpTool(req.params.slug, req.params.toolId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
