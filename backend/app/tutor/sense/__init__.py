"""Perception for the AI teacher: on-device camera and microphone features in, a gentle hint out."""

from app.tutor.sense.schema import Insight, SenseIn, Signal

__all__ = ["FEATURES", "Insight", "SenseIn", "Signal", "analyse"]


def __getattr__(name: str):
    """The LangGraph graph loads on first use: it is heavy, and sensing is off by default."""
    if name in ("FEATURES", "analyse"):
        from app.tutor.sense import graph

        return getattr(graph, name)
    raise AttributeError(name)
