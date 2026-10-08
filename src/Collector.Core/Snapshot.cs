namespace Collector.Core;

/// <summary>Everything read from all management servers in one collection run.</summary>
public record Snapshot(
    DateTimeOffset TakenAt,
    List<ManagementServer> ManagementServers,
    List<RecordingServer> RecordingServers,
    List<Camera> Cameras);

public record ManagementServer(string Id, string Name, string? Version = null);

public record RecordingServer(
    string Id,
    string Name,
    string ManagementServerId,
    bool Online,
    string? HostName = null);

public record Camera(
    string Id,
    string Name,
    string RecordingServerId,
    string ManagementServerId,
    bool Online,
    string? Model = null,
    string? IpAddress = null,
    string? MacAddress = null,
    string? Firmware = null);
