import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_data import list_body, parse_stats, resolve, strip_comments


class ExtractionTests(unittest.TestCase):
    def test_multiline_comments_and_random_range(self):
        text = 'list(STAT_STRENGTH = 1, // tank\n STAT_WILLPOWER = -1, STAT_FORTUNE = list(-2, 2),)'
        self.assertEqual(parse_stats(list_body(strip_comments(text), 4)),
                         {'strength': 1, 'willpower': -1, 'fortune': [-2, 2]})

    def test_statkey_and_string_keys(self):
        self.assertEqual(parse_stats('STATKEY_STR = 3, "intelligence" = 2'),
                         {'strength': 3, 'intelligence': 2})

    def test_lists_replace_inherited_list(self):
        defs = {'/base': {'stats': {'strength': 2}},
                '/base/child': {}, '/other': {'parent_type': '/base', 'stats': {}}}
        self.assertEqual(resolve(defs, '/base/child', 'stats'), {'strength': 2})
        self.assertEqual(resolve(defs, '/other', 'stats'), {})

    def test_unsupported_expression_fails(self):
        with self.assertRaises(ValueError):
            parse_stats('STAT_STRENGTH = some_proc()')

    def test_inheritance_cycle_stops(self):
        self.assertIsNone(resolve({'/a': {'parent_type': '/b'}, '/b': {'parent_type': '/a'}}, '/a', 'stats'))


if __name__ == '__main__':
    unittest.main()
