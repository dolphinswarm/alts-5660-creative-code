using Godot;
using System.Collections.Generic;

public partial class GameManager : Node
{
	private enum State { Idle, Countdown, Playing, Overtime }

	[Export] public Hoop Hoop;
	[Export] public Node StartButton;           // XRToolsInteractableAreaButton
	[Export] public Label3D StatusLabel;
	[Export] public Label3D ClockLabel;
	[Export] public Label3D ScoreLabel;
	[Export] public Label3D BestLabel;
	[Export] public AudioStreamPlayer3D Buzzer;
	[Export] public AudioStreamPlayer3D TickSound;
	[Export] public AudioStreamPlayer3D ButtonSound;
	[Export] public double GameLength = 60;
	[Export] public int TickFrom = 10;          // Clock ticks each second once this few remain
	[Export] public double CountdownLength = 3;
	[Export] public double BuzzerGrace = 3;     // Seconds for shots in the air at the buzzer to land
	[Export] public float InFlightSpeed = 1f;   // Slower balls at the buzzer aren't treated as shots
	[Export] public int PointsPerMake = 3;      // The player can't move, so every shot is a three

	private const string SavePath = "user://scores.cfg";

	private readonly HashSet<RigidBody3D> _liveBalls = new();
	private State _state = State.Idle;
	private double _timeLeft;
	private int _lastTick;
	private int _score;
	private int _best;

	public override void _Ready()
	{
		Hoop.Scored += OnScored;
		StartButton.Connect("button_pressed", Callable.From<Node>(OnStartPressed));

		var config = new ConfigFile();
		if (config.Load(SavePath) == Error.Ok)
		{
			_best = (int)config.GetValue("scores", "best", 0);
		}

		StatusLabel.Text = "PRESS START";
		ShowClock(GameLength);
		ShowScores();
	}

	public override void _Process(double delta)
	{
		if (_state == State.Idle)
		{
			return;
		}

		_timeLeft -= delta;

		if (_state == State.Countdown)
		{
			if (_timeLeft > 0)
			{
				StatusLabel.Text = Mathf.CeilToInt(_timeLeft).ToString();
				Tick();
				return;
			}

			_state = State.Playing;
			_timeLeft = GameLength;
			StatusLabel.Text = "GO!";
		}

		if (_state == State.Overtime)
		{
			// Picking a ball back up takes it out of play
			_liveBalls.RemoveWhere(ball => !IsInstanceValid(ball) || ball.Freeze);
			if (_timeLeft <= 0 || _liveBalls.Count == 0)
			{
				EndGame();
			}
			return;
		}

		if (_timeLeft <= 0)
		{
			SoundBuzzer();
			return;
		}

		if (GameLength - _timeLeft > 1)
		{
			StatusLabel.Text = "";
		}
		if (_timeLeft <= TickFrom)
		{
			Tick();
		}
		ShowClock(_timeLeft);
	}

	private void OnStartPressed(Node button)
	{
		ButtonSound.Play();

		// Ignore presses mid-game so a stray hand can't reset the score
		if (_state != State.Idle)
		{
			return;
		}

		_state = State.Countdown;
		_timeLeft = CountdownLength;
		_lastTick = -1;
		_score = 0;
		ShowClock(GameLength);
		ShowScores();
	}

	private void OnScored(RigidBody3D ball)
	{
		var inPlay = _state == State.Playing || (_state == State.Overtime && _liveBalls.Remove(ball));
		if (!inPlay)
		{
			return;
		}

		_score += PointsPerMake;
		ShowScores();
	}

	private void SoundBuzzer()
	{
		_state = State.Overtime;
		_timeLeft = BuzzerGrace;
		ShowClock(0);
		StatusLabel.Text = "";
		Buzzer.Play();

		// Buzzer-beaters: shots already out of a hand can still go in
		_liveBalls.Clear();
		foreach (var node in GetTree().GetNodesInGroup("ball"))
		{
			if (node is RigidBody3D ball && !ball.Freeze && ball.LinearVelocity.Length() > InFlightSpeed)
			{
				_liveBalls.Add(ball);
			}
		}
	}

	private void EndGame()
	{
		_state = State.Idle;
		_liveBalls.Clear();

		if (_score <= _best)
		{
			StatusLabel.Text = "GAME OVER";
			return;
		}

		_best = _score;
		StatusLabel.Text = "NEW BEST!";
		ShowScores();

		var config = new ConfigFile();
		config.SetValue("scores", "best", _best);
		config.Save(SavePath);
	}

	private void Tick()
	{
		// Once per whole second, as the displayed number changes
		var whole = Mathf.CeilToInt(_timeLeft);
		if (whole == _lastTick)
		{
			return;
		}

		_lastTick = whole;
		TickSound.Play();
	}

	private void ShowClock(double seconds)
	{
		var whole = Mathf.CeilToInt(seconds);
		ClockLabel.Text = $"{whole / 60}:{whole % 60:00}";
	}

	private void ShowScores()
	{
		// DSEG's "!" is a blank as wide as a digit, so the unlit "88" behind stays aligned
		ScoreLabel.Text = _score.ToString().PadLeft(2, '!');
		BestLabel.Text = _best.ToString().PadLeft(2, '!');
	}
}
