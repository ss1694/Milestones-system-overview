using Collector.Core;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(); // runs as a Windows service when installed; a normal console app otherwise
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

var app = builder.Build();

// Until the real Milestone collector exists, snapshots come from JSON files ("fake Milestone").
var folder = app.Configuration["SnapshotFolder"] ?? "fixtures";
if (!Path.IsPathRooted(folder)) folder = Path.Combine(AppContext.BaseDirectory, folder);

List<Snapshot> Snapshots() => FileSnapshotSource.LoadFolder(folder);

List<ChangeEvent> ChangeLog(List<Snapshot> s) =>
    s.Zip(s.Skip(1), SnapshotDiff.Compare).SelectMany(e => e).OrderByDescending(e => e.DetectedAt).ToList();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/summary", () =>
{
    var latest = Snapshots().LastOrDefault();
    if (latest is null) return Results.NotFound("No snapshots yet");
    return Results.Ok(new
    {
        latest.TakenAt,
        ManagementServers = latest.ManagementServers.Count,
        RecordingServers = latest.RecordingServers.Count,
        RecordingServersOnline = latest.RecordingServers.Count(r => r.Online),
        Cameras = latest.Cameras.Count,
        CamerasOnline = latest.Cameras.Count(c => c.Online),
    });
});

app.MapGet("/api/inventory", () => Snapshots().LastOrDefault() is { } s ? Results.Ok(s) : Results.NotFound());

app.MapGet("/api/changes", () => ChangeLog(Snapshots()));

app.MapGet("/api/changes.csv", () =>
{
    var lines = ChangeLog(Snapshots()).Select(e =>
        string.Join(',', e.DetectedAt.ToString("u"), e.Type, e.Kind, e.Id, $"\"{e.Name}\"", e.ManagementServerId, e.RecordingServerId, e.ReplacedId));
    var csv = "detectedAt,type,kind,id,name,managementServer,recordingServer,replacedId\n" + string.Join('\n', lines);
    return Results.File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", "changes.csv");
});

app.Run();
