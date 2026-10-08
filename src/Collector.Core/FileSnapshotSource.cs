using System.Text.Json;

namespace Collector.Core;

/// <summary>
/// "Fake Milestone": reads snapshots saved as JSON files. Used until the real Milestone
/// collector exists, and later for importing snapshots exported from Bjørn-Ove's scripts.
/// </summary>
public static class FileSnapshotSource
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static Snapshot Load(string path) =>
        JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(path), Json)
        ?? throw new InvalidDataException($"Empty snapshot file: {path}");

    /// <summary>All snapshot-*.json files in a folder, oldest first.</summary>
    public static List<Snapshot> LoadFolder(string folder) =>
        Directory.GetFiles(folder, "snapshot-*.json")
            .Select(Load)
            .OrderBy(s => s.TakenAt)
            .ToList();
}
