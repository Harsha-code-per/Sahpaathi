"""Stands in for anthropic.Anthropic in tests: canned replies, requests recorded, no API calls."""

from contextlib import nullcontext
from types import SimpleNamespace


def _message(stop: str, text: str = "", parsed=None):
    return SimpleNamespace(
        model="stub",
        usage=None,
        stop_reason=stop,
        parsed_output=parsed,
        content=[SimpleNamespace(type="text", text=text)],
    )


def stub_client(writer=(), judge=()):
    """writer: (text, stop_reason) replies for the scriptwriter (beta.messages.stream).
    judge: parsed models (or a stop_reason string) for the judge (messages.stream)."""
    writer, judge = list(writer), list(judge)
    requests: dict[str, list[dict]] = {"writer": [], "judge": []}

    def writer_stream(**kwargs):
        requests["writer"].append({**kwargs, "messages": list(kwargs["messages"])})
        text, stop = writer.pop(0)
        m = _message(stop, text)
        return nullcontext(SimpleNamespace(get_final_message=lambda: m))

    def judge_stream(**kwargs):
        requests["judge"].append(kwargs)
        reply = judge.pop(0)
        m = _message(reply) if isinstance(reply, str) else _message("end_turn", parsed=reply)
        return nullcontext(SimpleNamespace(get_final_message=lambda: m))

    return SimpleNamespace(
        beta=SimpleNamespace(messages=SimpleNamespace(stream=writer_stream)),
        messages=SimpleNamespace(stream=judge_stream),
        requests=requests,
    )
