using Godot;

public partial class BallSpawner : Node3D
{
	[Export] public PackedScene BallScene;
	[Export] public double RespawnDelay = 1.0;

	private RigidBody3D _waiting;

	public override void _Ready()
	{
		SpawnBall();
	}

	private void SpawnBall()
	{
		_waiting = BallScene.Instantiate<RigidBody3D>();
		// Frozen so stray balls can't knock it off; the ball's release mode unfreezes it once thrown
		_waiting.Freeze = true;
		AddChild(_waiting);
		_waiting.Connect("picked_up", Callable.From<RigidBody3D>(OnPickedUp));
	}

	private void OnPickedUp(RigidBody3D ball)
	{
		if (ball != _waiting)
		{
			return;
		}

		// Delay so the new ball doesn't spawn inside the one being grabbed
		_waiting = null;
		GetTree().CreateTimer(RespawnDelay).Timeout += SpawnBall;
	}
}
