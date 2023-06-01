$fn = 100;

KEYCHAIN=0;

module impostor() {
	d = 6;
	bodyH = 6;
	legsH = 2.5;
	legsW = 2;
	
	outline = 0.8;

	module leg() {
		difference() {
			square([legsW, legsH]);
			translate([outline, outline] / 2)
				square([legsW - outline, legsH]);
		}
	}

	// head
	difference() {
		translate([d/2, bodyH + legsH]) scale([1, 0.7])
			circle(d = d);

		translate([d/2, bodyH + legsH]) scale([1, 0.7])
			circle(d = d - outline);

		translate([0, legsH])
			square([d, bodyH]);
	}

	// body
	difference() {
		translate([0, legsH]) {
			difference() {
				square([d, bodyH]);
				translate([outline, outline] / 2)
					square([d - outline, bodyH]);

				translate([outline/2, -1])
					square([legsW - outline, bodyH]);

				translate([d - legsW + outline/2, -1])
					square([legsW - outline, bodyH]);

				translate([d - outline, 0.1*bodyH + outline/2])
					square([legsW, 0.8*bodyH - outline]);
			}
		}
		translate([1.1 * d * 0.5 - 0.8, legsH + bodyH - 1.5]) scale([1.1, 0.6])
			circle(d = d - outline * 2);
	}

	// legs
	leg();
	translate([d - legsW, 0])
		leg();

	// backpack
	translate([d, legsH + 0.1*bodyH]) {
		difference() {
			square([legsW, 0.8*bodyH]);
			translate([-outline, outline] / 2)
				square([legsW, 0.8*bodyH - outline]);
		}
	}

	letterOutline = 3.2;

	// eyes
	translate([1.1 * d * 0.5 - 0.8, legsH + bodyH - 1.5]) scale([1.1, 0.6])
		difference() {
			circle(d = d);
			circle(d = d - letterOutline);
		}

	// 9
	difference() {
		translate([1.1 * d - 0.8 - letterOutline / 2, 0])
			square([letterOutline / 2, legsH + bodyH - 1.5]);
		translate([1.1 * d * 0.5 - 0.8, legsH + bodyH - 1.5]) scale([1.1, 0.6])
			circle(d = d - outline);
	}

}

module sketch() {
	if (KEYCHAIN) {
		translate([ 0, 8 ]) {
			difference() {
				circle(d = 4);
				circle(d = 2);
			}
		}
	}

	text("0", font = "Ubuntu Mono");
	translate([5.5, 0])
		text("d", font = "Ubuntu Mono");
	translate([12, 0])
		impostor();
	translate([19, 0])
	text("e", font = "Ubuntu Mono");
}

if (KEYCHAIN) {
	linear_extrude(2) {
		sketch();
	}
} else {
	sketch();
}
