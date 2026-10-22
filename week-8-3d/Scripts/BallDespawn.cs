using Godot;

public partial class BallDespawn : Node
{
	[Export] public Node3D Model;
	[Export] public double Lifetime = 8;        // Seconds after leaving a hand before the ball shrinks away
	[Export] public double ShrinkTime = 0.4;

	private RigidBody3D _ball;
	private Timer _timer;

	public override void _Ready()
	{
		_timer = new Timer { OneShot = true };
		AddChild(_timer);
		_timer.Timeout += ShrinkAway;

		_ball = GetParent<RigidBody3D>();
		_ball.Connect("dropped", Callable.From<RigidBody3D>(_ => _timer.Start(Lifetime)));
		_ball.Connect("picked_up", Callable.From<RigidBody3D>(_ => _timer.Stop()));
	}

	private void ShrinkAway()
	{
		// Physics resets a rigid body's scale, so shrink the model and stop it being grabbed
		_ball.Set("enabled", false);
		var tween = CreateTween();
		tween.TweenProperty(Model, "scale", Vector3.One * 0.01f, ShrinkTime)
			.SetTrans(Tween.TransitionType.Back)
			.SetEase(Tween.EaseType.In);
		tween.TweenCallback(Callable.From(_ball.QueueFree));
	}
}
