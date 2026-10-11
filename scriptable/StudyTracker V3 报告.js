// StudyTracker V3.1 报告 — opens the historical week encoded in the notification.
const tracker=importModule('StudyTracker V3');
const query=args.queryParameters||{};
await tracker.run(null,{week:query.week||null});
Script.complete();
