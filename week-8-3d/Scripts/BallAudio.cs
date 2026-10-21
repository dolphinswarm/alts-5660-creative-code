using Godot;

public partial class BallAudio : Area3D
{
	[Export] public AudioStreamPlayer3D Player;
	[Export] public AudioStream DribbleSound;   // AudioStreamRandomizer of dribble1-4
	[Export] public AudioStream BackboardSound;
	[Export] public AudioStream RimSound;
	[Export] public AudioStream NetSound;
	[Export] public float MinImpactSpeed = 0.5f;
	[Export] public float MaxImpactSpeed = 8f;

	private RigidBody3D _ball;
	private Vector3 _lastVelocity;
	private AudioStreamPlaybackPolyphonic _playback;

	public override void _Ready()
	{
		_ball = GetParent<RigidBody3D>();
		_ball.ContactMonitor = true;
		_ball.MaxContactsReported = 4;
		_ball.BodyEntered += OnBodyEntered;
		AreaEntered += OnAreaEntered;

		Player.Stream = new AudioStreamPolyphonic();
		Player.Play();
		_playback = (AudioStreamPlaybackPolyphonic)Player.GetStreamPlayback();
	}

	public override void _PhysicsProcess(double delta)
	{
		// The signal fires after the bounce has already reversed the velocity
		_lastVelocity = _ball.LinearVelocity;
	}

	private void OnBodyEntered(Node body)
	{
		var speed = _lastVelocity.Length();
		if (speed < MinImpactSpeed)
		{
			return;
		}

		var sound = body.IsInGroup("backboard") ? BackboardSound
			: body.IsInGroup("rim") ? RimSound
			: DribbleSound;
		var volume = Mathf.Clamp(speed / MaxImpactSpeed, 0.1f, 1f);
		_playback.PlayStream(sound, 0, Mathf.LinearToDb(volume));
	}

	private void OnAreaEntered(Area3D area)
	{
		// Only swish on the way down, not when the ball pops up through the net
		if (area.IsInGroup("net") && _lastVelocity.Y < 0)
		{
			_playback.PlayStream(NetSound);
		}
	}
}
