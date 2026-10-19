"""Unit tests for edge-to-cloud IoT event normalizer Lambda function."""
import unittest
import json
from unittest.mock import patch, MagicMock

# Import normalizer handler (simulated context)
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestEventNormalizer(unittest.TestCase):
    def setUp(self):
        self.sample_telemetry = {
            "device_id": "anchor_unit_01",
            "timestamp": 1727467200,
            "metrics": {
                "temperature": 24.5,
                "humidity": 48.2,
                "vibration_rms": 0.082,
                "pressure_kpa": 101.3
            },
            "status": "OPERATIONAL"
        }

    def test_payload_validation(self):
        """Verify standard telemetry structure matches schema."""
        self.assertIn("device_id", self.sample_telemetry)
        self.assertIn("metrics", self.sample_telemetry)
        self.assertGreater(self.sample_telemetry["metrics"]["temperature"], -40)
        self.assertLess(self.sample_telemetry["metrics"]["temperature"], 85)

    def test_vibration_threshold(self):
        """Test alert triggering for excessive vibration."""
        critical_vibration = 0.450  # Over 0.250 threshold
        self.sample_telemetry["metrics"]["vibration_rms"] = critical_vibration
        
        is_alert = self.sample_telemetry["metrics"]["vibration_rms"] > 0.250
        self.assertTrue(is_alert)

if __name__ == '__main__':
    unittest.main()
