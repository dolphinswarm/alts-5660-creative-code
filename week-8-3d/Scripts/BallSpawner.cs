using Godot;
using System.Collections.Generic;

public partial class BallSpawner : Node3D
{
	[Export] public PackedScene BallScene;
	[Export] public int MaxBalls = 6;
	[Export] public double RespawnDelay = 1.0;

	private readonly Queue<RigidBody3D> _balls = new();
	private RigidBody3D _waiting;

	public override void _Ready()
	{
		SpawnBall();
	}

	private void SpawnBall()
	{
		_waiting = BallScene.Instantiate<RigidBody3D>();
		AddChild(_waiting);
		_waiting.Connect("picked_up", Callable.From<RigidBody3D>(OnPickedUp));
		_balls.Enqueue(_waiting);

		if (_balls.Count > MaxBalls)
		{
			// Handles the case where the oldest ball is still in a hand
			_balls.Dequeue().Call("drop_and_free");
		}
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
