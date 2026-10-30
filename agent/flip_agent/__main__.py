"""Command line: python -m flip_agent <command>

  enrol        --server URL --token TOKEN        create this site's key and enrol it
  add-dataset  --name NAME --path FILE.csv        register a local dataset (schema only)
  run                                             answer federated tasks until stopped
  status                                          show this agent's identity and datasets
"""
import argparse
import logging
import sys
from pathlib import Path

from .core import Agent, AgentState


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="flip_agent", description="FLIP site agent")
    ap.add_argument("--state", default=".flip-agent", help="folder for this site's key and settings")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("enrol")
    e.add_argument("--server", required=True)
    e.add_argument("--token", required=True)
    d = sub.add_parser("add-dataset")
    d.add_argument("--name", required=True)
    d.add_argument("--path", required=True)
    sub.add_parser("run")
    sub.add_parser("status")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

    state = AgentState.load(Path(args.state))
    if args.cmd == "enrol":
        state.server = args.server
        info = Agent(state).enrol(args.token)
        print(f"Enrolled as '{info['site_name']}' ({info['organisation']}). Key stored in {state.key_path}.")
        return 0
    if not state.site_id:
        print("This agent is not enrolled yet. Run: python -m flip_agent enrol --server URL --token TOKEN", file=sys.stderr)
        return 1
    agent = Agent(state)
    if args.cmd == "add-dataset":
        schema = agent.add_dataset(args.name, Path(args.path))
        print(f"Registered '{args.name}': {schema['rows']} rows, {len(schema['columns'])} columns. Only the schema was sent.")
    elif args.cmd == "status":
        print(f"Site {state.site_name} (#{state.site_id}) on {state.server}")
        for name, path in state.datasets.items():
            print(f"  dataset {name}: {path}")
        print("  server says:", agent.heartbeat())
    else:
        agent.run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
