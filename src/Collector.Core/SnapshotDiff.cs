namespace Collector.Core;

public enum ChangeType { Added, Removed, WentOffline, BackOnline, PossibleReplacement }

public enum ItemKind { RecordingServer, Camera }

/// <summary>One line in the change log.</summary>
/// <param name="ReplacedId">Only for PossibleReplacement: the id of the camera that disappeared.</param>
public record ChangeEvent(
    ChangeType Type,
    ItemKind Kind,
    string Id,
    string Name,
    string ManagementServerId,
    string? RecordingServerId,
    DateTimeOffset DetectedAt,
    string? ReplacedId = null);

/// <summary>
/// Compares two snapshots and lists what changed. Items are matched by their Milestone id,
/// so a renamed camera is not reported as removed + added.
/// </summary>
public static class SnapshotDiff
{
    public static List<ChangeEvent> Compare(Snapshot previous, Snapshot current)
    {
        var at = current.TakenAt;
        var events = new List<ChangeEvent>();

        events.AddRange(CompareItems(
            previous.RecordingServers, current.RecordingServers, r => r.Id, r => r.Online,
            (type, r) => new ChangeEvent(type, ItemKind.RecordingServer, r.Id, r.Name, r.ManagementServerId, null, at)));

        var cameraEvents = CompareItems(
            previous.Cameras, current.Cameras, c => c.Id, c => c.Online,
            (type, c) => new ChangeEvent(type, ItemKind.Camera, c.Id, c.Name, c.ManagementServerId, c.RecordingServerId, at));
        events.AddRange(cameraEvents);
        events.AddRange(PossibleReplacements(cameraEvents, at));

        return events;
    }

    static List<ChangeEvent> CompareItems<T>(
        IEnumerable<T> previous, IEnumerable<T> current,
        Func<T, string> id, Func<T, bool> online,
        Func<ChangeType, T, ChangeEvent> toEvent)
    {
        var before = previous.ToDictionary(id);
        var after = current.ToDictionary(id);
        var events = new List<ChangeEvent>();

        foreach (var (key, item) in after)
        {
            if (!before.TryGetValue(key, out var old))
                events.Add(toEvent(ChangeType.Added, item));
            else if (online(old) && !online(item))
                events.Add(toEvent(ChangeType.WentOffline, item));
            else if (!online(old) && online(item))
                events.Add(toEvent(ChangeType.BackOnline, item));
        }

        foreach (var (key, item) in before)
            if (!after.ContainsKey(key))
                events.Add(toEvent(ChangeType.Removed, item));

        return events;
    }

    /// <summary>
    /// A guess, shown as such in the UI: a camera disappeared and a new one appeared
    /// on the same recording server in the same run. Pairs them one-to-one by name order.
    /// </summary>
    static IEnumerable<ChangeEvent> PossibleReplacements(List<ChangeEvent> cameraEvents, DateTimeOffset at)
    {
        foreach (var group in cameraEvents.GroupBy(e => e.RecordingServerId))
        {
            var removed = group.Where(e => e.Type == ChangeType.Removed).OrderBy(e => e.Name).ToList();
            var added = group.Where(e => e.Type == ChangeType.Added).OrderBy(e => e.Name).ToList();
            foreach (var (gone, isNew) in removed.Zip(added))
                yield return isNew with { Type = ChangeType.PossibleReplacement, ReplacedId = gone.Id, DetectedAt = at };
        }
    }
}
