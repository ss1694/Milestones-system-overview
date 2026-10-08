using Collector.Core;

namespace Collector.Core.Tests;

public class SnapshotDiffTests
{
    static readonly DateTimeOffset Day1 = new(2026, 10, 6, 6, 0, 0, TimeSpan.Zero);
    static readonly DateTimeOffset Day2 = Day1.AddDays(1);

    static Camera Cam(string id, bool online = true, string rec = "REC-1", string? name = null) =>
        new(id, name ?? id, rec, "MGMT-1", online);

    static Snapshot Snap(DateTimeOffset at, params Camera[] cams) =>
        new(at, [new("MGMT-1", "MGMT-1")], [new("REC-1", "REC-1", "MGMT-1", true), new("REC-2", "REC-2", "MGMT-1", true)], [.. cams]);

    [Fact]
    public void No_changes_gives_empty_log()
    {
        var events = SnapshotDiff.Compare(Snap(Day1, Cam("A")), Snap(Day2, Cam("A")));
        Assert.Empty(events);
    }

    [Fact]
    public void New_camera_is_added()
    {
        var e = Assert.Single(SnapshotDiff.Compare(Snap(Day1), Snap(Day2, Cam("A"))));
        Assert.Equal(ChangeType.Added, e.Type);
        Assert.Equal("A", e.Id);
        Assert.Equal(Day2, e.DetectedAt);
    }

    [Fact]
    public void Missing_camera_is_removed()
    {
        var e = Assert.Single(SnapshotDiff.Compare(Snap(Day1, Cam("A")), Snap(Day2)));
        Assert.Equal(ChangeType.Removed, e.Type);
    }

    [Fact]
    public void Offline_is_not_the_same_as_removed()
    {
        var e = Assert.Single(SnapshotDiff.Compare(Snap(Day1, Cam("A")), Snap(Day2, Cam("A", online: false))));
        Assert.Equal(ChangeType.WentOffline, e.Type);
    }

    [Fact]
    public void Camera_coming_back_is_back_online()
    {
        var e = Assert.Single(SnapshotDiff.Compare(Snap(Day1, Cam("A", online: false)), Snap(Day2, Cam("A"))));
        Assert.Equal(ChangeType.BackOnline, e.Type);
    }

    [Fact]
    public void Renamed_camera_is_not_a_change()
    {
        var events = SnapshotDiff.Compare(Snap(Day1, Cam("A", name: "Old name")), Snap(Day2, Cam("A", name: "New name")));
        Assert.Empty(events);
    }

    [Fact]
    public void Swap_on_same_recording_server_is_flagged_as_possible_replacement()
    {
        var events = SnapshotDiff.Compare(Snap(Day1, Cam("OLD")), Snap(Day2, Cam("NEW")));

        Assert.Contains(events, e => e.Type == ChangeType.Removed && e.Id == "OLD");
        Assert.Contains(events, e => e.Type == ChangeType.Added && e.Id == "NEW");
        var guess = Assert.Single(events, e => e.Type == ChangeType.PossibleReplacement);
        Assert.Equal("NEW", guess.Id);
        Assert.Equal("OLD", guess.ReplacedId);
    }

    [Fact]
    public void Swap_across_different_recording_servers_is_not_a_replacement()
    {
        var events = SnapshotDiff.Compare(Snap(Day1, Cam("OLD", rec: "REC-1")), Snap(Day2, Cam("NEW", rec: "REC-2")));
        Assert.DoesNotContain(events, e => e.Type == ChangeType.PossibleReplacement);
    }

    [Fact]
    public void Recording_server_going_offline_is_logged()
    {
        var before = Snap(Day1);
        var after = before with { TakenAt = Day2, RecordingServers = [new("REC-1", "REC-1", "MGMT-1", false), before.RecordingServers[1]] };

        var e = Assert.Single(SnapshotDiff.Compare(before, after));
        Assert.Equal(ItemKind.RecordingServer, e.Kind);
        Assert.Equal(ChangeType.WentOffline, e.Type);
    }

    [Fact]
    public void Sample_fixtures_load_and_produce_changes()
    {
        var folder = Path.Combine(AppContext.BaseDirectory, "fixtures");
        var snapshots = FileSnapshotSource.LoadFolder(folder);

        Assert.Equal(2, snapshots.Count);
        var events = SnapshotDiff.Compare(snapshots[0], snapshots[1]);
        foreach (var type in Enum.GetValues<ChangeType>())
            Assert.Contains(events, e => e.Type == type);
    }
}
