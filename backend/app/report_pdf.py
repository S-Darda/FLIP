"""PDF training reports (A4, vector figures).

Structure: title block, 1 Summary, 2 Study and method, 3 Results (numbered figures and tables
with captions), 4 Privacy and security, 5 Limitations, 6 Discussion (author notes),
7 Comments and feedback, and a signed-artefact appendix. Every figure is drawn from aggregate
statistics already in the report; nothing here reads site data."""
import io
import json
from datetime import datetime, timezone

from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, Line, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)
from xml.sax.saxutils import escape

INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#5b6478")
ACCENT = colors.HexColor("#0f766e")
ACCENT_2 = colors.HexColor("#1e3a8a")
RULE = colors.HexColor("#d7dce5")
SOFT = colors.HexColor("#f1f5f9")
SERIES = [colors.HexColor(c) for c in ("#0f766e", "#1d4ed8", "#b45309", "#7c3aed", "#be123c", "#15803d", "#475569")]

ss = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("t", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=INK, alignment=0, spaceAfter=4),
    "sub": ParagraphStyle("s", parent=ss["Normal"], fontSize=10.5, leading=14, textColor=MUTED),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=ACCENT_2, spaceBefore=12, spaceAfter=5, keepWithNext=1),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=8, spaceAfter=3, keepWithNext=1),
    "body": ParagraphStyle("b", parent=ss["BodyText"], fontSize=9.6, leading=13.6, textColor=INK, spaceAfter=5),
    "small": ParagraphStyle("sm", parent=ss["BodyText"], fontSize=8.2, leading=11, textColor=MUTED),
    "caption": ParagraphStyle("c", parent=ss["BodyText"], fontSize=8.4, leading=11.2, textColor=MUTED, alignment=TA_CENTER, spaceBefore=2, spaceAfter=9),
    "cell": ParagraphStyle("cell", parent=ss["BodyText"], fontSize=8.6, leading=11, textColor=INK),
    "notice": ParagraphStyle("n", parent=ss["BodyText"], fontSize=8.6, leading=11.6, textColor=colors.HexColor("#92400e"),
                             backColor=colors.HexColor("#fef3c7"), borderPadding=6, spaceBefore=6, spaceAfter=8),
}


def P(text, style="body"):
    return Paragraph(text, S[style])


def esc(text) -> str:
    return escape(str(text if text is not None else "—")).replace("\n", "<br/>")


def pct(v):
    return "—" if v is None else f"{v * 100:.1f}%"


def f3(v):
    return "—" if v is None else f"{v:.3f}"


class Numbering:
    def __init__(self):
        self.fig = 0
        self.tab = 0

    def figure(self, caption):
        self.fig += 1
        return P(f"<b>Figure {self.fig}.</b> {caption}", "caption")

    def table(self, caption):
        self.tab += 1
        return P(f"<b>Table {self.tab}.</b> {caption}", "caption")


def kv_table(rows, widths=(52 * mm, 112 * mm)):
    data = [[P(f"<b>{esc(k)}</b>", "cell"), P(esc(v), "cell")] for k, v in rows]
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
                           ("BACKGROUND", (0, 0), (0, -1), SOFT), ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t


def grid_table(header, rows, widths=None, highlight_diag=False):
    data = [[P(f"<b>{esc(h)}</b>", "cell") for h in header]] + [[P(esc(c), "cell") for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), SOFT), ("LINEBELOW", (0, 0), (-1, 0), 0.8, ACCENT),
             ("LINEBELOW", (0, 1), (-1, -1), 0.3, RULE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if highlight_diag:
        for i in range(1, len(data)):
            if i < len(data[0]):
                style.append(("BACKGROUND", (i, i), (i, i), colors.HexColor("#ccfbf1")))
    t.setStyle(TableStyle(style))
    return t


def line_chart(series, y_label, x_label="Round", y_fmt="%.2f", width=165 * mm, height=62 * mm):
    d = Drawing(width, height)
    lp = LinePlot()
    lp.x, lp.y, lp.width, lp.height = 34, 26, width - 50, height - 44
    lp.data = [s["points"] for s in series if s["points"]]
    if not lp.data:
        d.add(String(width / 2, height / 2, "No data", textAnchor="middle", fillColor=MUTED, fontSize=9))
        return d
    for i, s in enumerate(series):
        lp.lines[i].strokeColor = s.get("color", SERIES[i % len(SERIES)])
        lp.lines[i].strokeWidth = 1.4
    xs = [p[0] for s in lp.data for p in s]
    ys = [p[1] for s in lp.data for p in s]
    lp.xValueAxis.valueMin, lp.xValueAxis.valueMax = min(xs), max(xs) if max(xs) > min(xs) else min(xs) + 1
    pad = (max(ys) - min(ys)) * 0.08 or 0.05
    lp.yValueAxis.valueMin, lp.yValueAxis.valueMax = min(ys) - pad, max(ys) + pad
    lp.yValueAxis.labelTextFormat = y_fmt
    for ax in (lp.xValueAxis, lp.yValueAxis):
        ax.labels.fontName, ax.labels.fontSize, ax.labels.fillColor, ax.strokeColor = "Helvetica", 7, MUTED, RULE
    lp.yValueAxis.visibleGrid, lp.yValueAxis.gridStrokeColor = True, colors.HexColor("#eef1f6")
    d.add(lp)
    d.add(String(lp.x + lp.width / 2, 4, x_label, textAnchor="middle", fontSize=7.5, fillColor=MUTED))
    d.add(String(4, lp.y + lp.height + 6, y_label, fontSize=7.5, fillColor=MUTED))
    if len(series) > 1:
        lg = Legend()
        lg.x, lg.y, lg.alignment = lp.x + 70, height - 4, "right"
        lg.fontName, lg.fontSize, lg.columnMaximum, lg.dx, lg.dy = "Helvetica", 7, 1, 7, 7
        lg.colorNamePairs = [(s.get("color", SERIES[i % len(SERIES)]), s["name"]) for i, s in enumerate(series)]
        lg.deltax = 60
        d.add(lg)
    return d


def hbar_chart(labels, values, fmt="%.2f", width=165 * mm, max_value=None, color=ACCENT):
    height = max(40, 16 * len(labels) + 26)
    d = Drawing(width, height)
    bc = HorizontalBarChart()
    bc.x, bc.y, bc.width, bc.height = 105, 12, width - 140, height - 20
    bc.data = [values]
    bc.categoryAxis.categoryNames = labels
    bc.categoryAxis.labels.fontSize, bc.categoryAxis.labels.fillColor = 7.5, INK
    bc.categoryAxis.labels.fontName = bc.valueAxis.labels.fontName = bc.barLabels.fontName = "Helvetica"
    bc.categoryAxis.strokeColor = RULE
    bc.valueAxis.valueMin = 0
    if max_value:
        bc.valueAxis.valueMax = max_value
    bc.valueAxis.labels.fontSize, bc.valueAxis.labels.fillColor, bc.valueAxis.strokeColor = 7, MUTED, RULE
    bc.valueAxis.labelTextFormat = fmt
    bc.bars[0].fillColor, bc.bars[0].strokeColor = color, None
    bc.barLabelFormat, bc.barLabels.fontSize, bc.barLabels.nudge = fmt, 7, 12
    d.add(bc)
    return d


def calibration_chart(bins, width=120 * mm, height=62 * mm):
    d = Drawing(width, height)
    lp = LinePlot()
    lp.x, lp.y, lp.width, lp.height = 34, 26, width - 50, height - 40
    pts = [(b["confidence"], b["accuracy"]) for b in bins if b["count"] >= 5 and b["confidence"] is not None]
    lp.data = [[(0, 0), (1, 1)], pts or [(0, 0)]]
    lp.lines[0].strokeColor, lp.lines[0].strokeDashArray, lp.lines[0].strokeWidth = MUTED, [2, 2], 0.8
    lp.lines[1].strokeColor, lp.lines[1].strokeWidth = ACCENT, 1.6
    for ax in (lp.xValueAxis, lp.yValueAxis):
        ax.valueMin, ax.valueMax, ax.labels.fontSize, ax.labels.fillColor, ax.strokeColor = 0, 1, 7, MUTED, RULE
        ax.labels.fontName = "Helvetica"
        ax.labelTextFormat = "%.1f"
    d.add(lp)
    d.add(String(lp.x + lp.width / 2, 4, "Mean predicted confidence", textAnchor="middle", fontSize=7.5, fillColor=MUTED))
    d.add(String(4, lp.y + lp.height + 6, "Observed accuracy", fontSize=7.5, fillColor=MUTED))
    return d


def build_pdf(run: dict, project: dict, generated_by: str) -> bytes:
    rep = run.get("report") or {}
    task = run["task_type"]
    rounds = run.get("round_metrics") or []
    num = Numbering()
    buf = io.BytesIO()
    title = f"Model Training Report · {project['project_name']}"
    stamp = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    def frame(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(ACCENT)
        canvas.setLineWidth(2)
        canvas.line(18 * mm, A4[1] - 12 * mm, A4[0] - 18 * mm, A4[1] - 12 * mm)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(ACCENT_2)
        canvas.drawString(18 * mm, A4[1] - 10 * mm, "FLIP · Federated Learning Infrastructure Platform")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 10 * mm, f"Run #{run['training_id']} · {run['mode_label']}")
        canvas.drawString(18 * mm, 10 * mm, f"Generated {stamp} by {generated_by} · Research prototype, not for clinical or financial decisions")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm,
                            bottomMargin=18 * mm, title=title, author="FLIP", subject="Federated training report")
    story = []

    # ---- title block
    story += [P("Model Training Report", "title"),
              P(f"<b>{esc(project['project_name'])}</b> · run #{run['training_id']}"
                + (f" · AutoML trial {run['trial_index']} of {run['trial_count']}{' (selected best)' if run.get('is_best') else ''}"
                   if run.get('trial_count', 1) > 1 else ""), "sub"),
              P(f"{esc(run['mode_label'])} · {esc(project['domain'])} · status {esc(run['status'])} · "
                f"started {esc((run.get('started_at') or '')[:16].replace('T', ' '))} UTC by {esc(run.get('started_by_name'))}", "sub"),
              P(esc(rep.get("update_visibility", "")), "notice")]

    # ---- 1 summary (generated narrative)
    sites = rep.get("sites", run.get("num_nodes"))
    if task == "classification":
        headline = (f"On held-out test data pooled from every site's local test split, the model reached an accuracy of "
                    f"<b>{pct(rep.get('accuracy'))}</b>, macro F1 <b>{f3(rep.get('f1'))}</b> and macro AUROC <b>{f3(rep.get('auroc'))}</b>, "
                    f"with expected calibration error {f3(rep.get('ece'))}.")
    else:
        headline = (f"On held-out test data pooled from every site's local test split, the model reached RMSE "
                    f"<b>{f3(rep.get('rmse'))}</b>, MAE <b>{f3(rep.get('mae'))}</b> and R² <b>{f3(rep.get('r2'))}</b>.")
    priv = rep.get("privacy") or {}
    ptext = (f"Client-level differential privacy was applied, spending ε = {priv['epsilon']:.2f} at δ = {priv['delta']:.0e}."
             if priv.get("guarantee") else "No differential privacy was applied, so the model carries no formal privacy guarantee.")
    story += [P("1. Summary", "h1"),
              P(f"This report describes a {esc(run['mode_label'])} run of the study <i>{esc(project['project_name'])}</i>, "
                f"a {task} task{(' predicting <b>' + esc(project['target']) + '</b>') if project.get('target') else ''}. "
                f"{sites} site(s) took part over {run['current_round']} round(s) of {esc(run['algorithm'])} aggregation "
                f"using a {esc(run['model_label']).lower()} model. {headline} {ptext}"),
              ]
    if project.get("objectives"):
        story.append(P(f"<b>Study objectives.</b> {esc(project['objectives'])}"))

    # ---- 2 study and method
    feats = rep.get("features") or project.get("features") or []
    story += [P("2. Study and method", "h1"),
              P("Each site prepared its own 70/15/15 train/validation/test split locally and reported only per-feature counts, "
                "sums and sums of squares, from which the coordinator derived global standardisation statistics. In every round "
                "the selected sites trained locally from the current global weights and returned a weight update; the coordinator "
                "aggregated the updates and every site then scored the new model on its validation split, returning aggregate "
                "statistics only. AutoML trials are compared on validation scores; the test split is used once, for this report."),
              KeepTogether([kv_table([("Task", f"{task} · {', '.join(rep.get('classes') or []) or 'continuous target'}"),
                        ("Dataset", run.get("data_source")),
                        ("Target", project.get("target") or ("label" if task == "classification" else "target") + " (synthetic)"),
                        ("Features", f"{len(feats)}: {', '.join(feats)}"),
                        ("Model", f"{run['model_label']} · {rep.get('parameters', '—')} parameters"),
                        ("Aggregation", run["algorithm"] + (f" (μ = {run['mu']})" if run["algorithm"] == "FedProx" else "")),
                        ("Rounds", f"{run['current_round']} of {run['rounds']} · {round(run['client_fraction'] * 100)}% of sites per round"),
                        ("Local training", f"{run['local_epochs']} epoch(s), batch {run['batch_size']}, learning rate {run['learning_rate']}"),
                        ("Differential privacy", f"clip {run['clip_norm']}, noise multiplier {run['noise_multiplier']}" if run["dp_enabled"] else "off"),
                        ("Training samples", rep.get("train_samples")),
                        ("Selection metric", rep.get("selection_metric"))]),
                            num.table("Study configuration for this run.")])]

    # ---- 3 results
    results_heading = P("3. Results", "h1")
    if task == "classification":
        metrics = [("Accuracy", pct(rep.get("accuracy"))), ("Macro precision", f3(rep.get("precision"))),
                   ("Macro recall", f3(rep.get("recall"))), ("Macro F1", f3(rep.get("f1"))),
                   ("Macro AUROC (one-vs-rest)", f3(rep.get("auroc"))), ("Expected calibration error", f3(rep.get("ece"))),
                   ("Log loss", f3(rep.get("loss"))), ("Test rows (all sites)", rep.get("n"))]
    else:
        metrics = [("RMSE", f3(rep.get("rmse"))), ("MAE", f3(rep.get("mae"))), ("R²", f3(rep.get("r2"))),
                   ("Loss (standardised)", f3(rep.get("loss"))), ("Test rows (all sites)", rep.get("n"))]
    val = rep.get("validation") or {}
    story += [KeepTogether([results_heading, kv_table(metrics), num.table("Final metrics on the pooled test splits.")])]
    metric_key, metric_name = ("accuracy", "Validation accuracy") if task == "classification" else ("rmse", "Validation RMSE")
    pts = [(r["round"], r[metric_key]) for r in rounds if r.get(metric_key) is not None]
    story += [KeepTogether([line_chart([{"name": metric_name, "points": pts}], metric_name, y_fmt="%.2f"),
                            num.figure(f"{metric_name} of the global model after each round, computed from aggregate "
                                       f"statistics returned by every site. "
                                       + ("Higher is better." if task == "classification" else "Lower is better."))]),
              KeepTogether([line_chart([{"name": "Loss", "points": [(r["round"], r["loss"]) for r in rounds]}], "Validation loss",
                                       y_fmt="%.3f"),
                            num.figure("Validation loss per round. A flattening curve suggests the federation has converged "
                                       "for these settings.")])]
    node_names = [n["name"] for n in (rounds[-1]["nodes"] if rounds else [])]
    if node_names:
        series = []
        for i, name in enumerate(node_names):
            p = [(r["round"], n[metric_key]) for r in rounds for n in r["nodes"]
                 if n["name"] == name and n.get(metric_key) is not None and not n.get("suppressed")]
            if p:
                series.append({"name": name, "points": p, "color": SERIES[i % len(SERIES)]})
        if series:
            story += [KeepTogether([line_chart(series, f"Per-site {metric_name.lower()}"),
                                    num.figure("Each site's score for the global model on its own validation split. "
                                               f"Sites with fewer than {rep.get('min_report_rows', 20)} validation rows are suppressed.")])]
    per_site = rep.get("per_site") or []
    if per_site:
        rows = [[s["name"], "suppressed (small group)" if s.get("suppressed") else s.get("rows"),
                 "—" if s.get("suppressed") else (pct(s.get("accuracy")) if task == "classification" else f3(s.get("rmse")))]
                for s in per_site]
        story += [KeepTogether([grid_table(["Site", "Test rows", "Accuracy" if task == "classification" else "RMSE"], rows,
                                           widths=[70 * mm, 45 * mm, 49 * mm]),
                                num.table("Final per-site results on each site's own test split.")])]
    if task == "classification" and rep.get("confusion_matrix"):
        classes = rep.get("classes") or []
        cm = rep["confusion_matrix"]
        story += [KeepTogether([grid_table(["Actual \\ predicted"] + classes, [[classes[i]] + row for i, row in enumerate(cm)],
                                           highlight_diag=True),
                                num.table("Confusion matrix pooled across sites (counts). Shaded cells are correct predictions.")])]
        pcs = rep.get("per_class") or []
        story += [grid_table(["Class", "Precision", "Recall", "F1", "AUROC", "Support"],
                             [[c["class"], f3(c["precision"]), f3(c["recall"]), f3(c["f1"]), f3(c.get("auroc")), c["support"]] for c in pcs]),
                  num.table("Per-class results.")]
        if rep.get("calibration"):
            story += [KeepTogether([calibration_chart(rep["calibration"]),
                                    num.figure("Reliability diagram: observed accuracy against predicted confidence in 20 bins. "
                                               "Bins with fewer than 5 test rows are omitted. The dashed line is perfect calibration.")])]
    if rep.get("feature_importance"):
        fi = rep["feature_importance"]
        story += [KeepTogether([hbar_chart([f["feature"] for f in fi][::-1], [f["weight"] for f in fi][::-1], fmt="%.2f"),
                                num.figure("Feature influence: magnitude of each standardised feature's weight in the linear model. "
                                           "This shows association within the model, not causation.")])]
    trials = run.get("trials") or []
    if len(trials) > 1:
        story += [grid_table(["Trial", "Run", "Model", "Learning rate", "Epochs", "Validation score", "Selected"],
                             [[t["trial_index"], f"#{t['training_id']}", t["model_label"], t["learning_rate"], t["local_epochs"],
                               f3(t.get("selection_score")), "yes" if t["is_best"] else ""] for t in trials]),
                  num.table(f"AutoML search. Trials are ranked by {rep.get('selection_metric', 'validation score')}.")]

    # ---- 4 privacy and security
    story += [P("4. Privacy and security", "h1"),
              P(esc(priv.get("note", ""))),
              kv_table([("Protected unit", priv.get("unit") or "none"),
                        ("Budget spent", f"ε = {priv['epsilon']:.2f}, δ = {priv['delta']:.0e}" if priv.get("guarantee") else "no guarantee"),
                        ("Accountant", priv.get("accountant") or "—"),
                        ("Update visibility", rep.get("update_visibility")),
                        ("Small-group suppression", f"per-site figures hidden below {rep.get('min_report_rows', 20)} rows"),
                        ("Site dropouts", ", ".join(f"{k}: {v} round(s)" for k, v in (rep.get("dropouts") or {}).items()) or "none")]),
              num.table("Privacy controls that applied to this run.")]

    # ---- 5 limitations
    story += [P("5. Limitations", "h1"),
              P("FLIP is a research prototype. Secure aggregation is not yet implemented, so the coordinator can see each site's "
                "update. The released model and the aggregate metrics can still leak information about the data, more so without "
                "differential privacy or with a large ε. Metrics are computed on each site's own split, so they reflect those "
                "sites' populations and may not transfer elsewhere. Simulation runs use synthetic data and say nothing about real "
                "performance. Do not use this model for clinical, financial or other consequential decisions without independent "
                "validation, a data-protection impact assessment and an external security review.")]

    # ---- 6 discussion
    story.append(P("6. Discussion", "h1"))
    story.append(P(esc(run["notes"])) if run.get("notes") else P("<i>The study owner has not added discussion notes.</i>", "small"))

    # ---- 7 comments and feedback
    story.append(P("7. Comments and feedback", "h1"))
    entries = []
    if project.get("feedback"):
        entries.append(("Study review", project.get("reviewed_by_name") or "Admin", project.get("reviewed_at"), project["feedback"]))
    for s in project.get("submissions") or []:
        if s.get("training_id") == run["training_id"] and s.get("admin_comment"):
            entries.append((f"Deployment review ({s['status']})", "Admin", s.get("reviewed_at"), s["admin_comment"]))
    for c in run.get("comments") or []:
        entries.append(("Feedback" if c["kind"] == "feedback" else "Comment", f"{c['author']} ({c.get('role') or '—'})", c["created_at"], c["body"]))
    if entries:
        story.append(grid_table(["Type", "From", "Date", "Comment"],
                                [[k, who, (when or "")[:16].replace("T", " "), body] for k, who, when, body in entries],
                                widths=[30 * mm, 34 * mm, 26 * mm, 74 * mm]))
    else:
        story.append(P("<i>No comments yet.</i>", "small"))

    # ---- appendix: artefact
    art = run.get("artefact")
    story += [Spacer(1, 6), P("Appendix: signed model artefact", "h2"),
              P(f"Artefact version {art['version']} · SHA-256 <font face='Courier'>{art['sha256']}</font> · Ed25519 key "
                f"<font face='Courier'>{art['key_id']}</font>. Verify the downloaded artefact against the public key at "
                f"<font face='Courier'>/api/artefacts/public-key</font>." if art else "No artefact was produced.", "small")]

    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()
