"""Subject entry point for the shared strict compiler."""
import pathlib, runpy, sys
sys.argv.insert(1, 'gcse-history')
runpy.run_path(str(pathlib.Path(__file__).resolve().parents[1]/'build.py'), run_name='__main__')
