'use strict';

LDR = LDR || {};

LDR.PLIBuilder = function(ldrLoader, mainModelID, mainModelColor, pliElement, pliRenderElement) {
    this.ldrLoader = ldrLoader;
    this.pliElement = pliElement;
    this.pliRenderElement = pliRenderElement;
    this.partsBuilder = new LDR.PartsBulder(ldrLoader, mainModelID, mainModelColor);
    this.fillHeight = false;

    // Register for options changes:
    var self = this;
    ldrOptions.listeners.push(function() {
	if(self.lastStep) {
	    self.drawPLIForStep(self.fillHeight, self.lastStep, self.lastColorID,
				self.lastMaxWidth, self.lastMaxHeight, true);
	}
    });

    // Set up rendering elements:
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000000);
    this.camera.position.x = 10000;
    this.camera.position.y = 7000;
    this.camera.position.z = 10000;
    this.camera.lookAt(new THREE.Vector3());
    this.measurer = new LDR.Measurer(this.camera);

    this.scene = new THREE.Scene(); // Will only contain one element at a time.
    this.scene.background = new THREE.Color(0xFFFFFF);

    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    pliRenderElement.appendChild(this.renderer.domElement);
}

LDR.PLIBuilder.prototype.getPC = function(key) {
    var pc = this.partsBuilder.pcs[key];
    if(!pc.mesh) {
	pc.mesh = new THREE.Group();
	pc.draw(pc.mesh);
	var elementCenter = new THREE.Vector3();
	var b = pc.getBounds();
	b.getCenter(elementCenter);
	pc.mesh.position.x = -elementCenter.x;
	pc.mesh.position.y = -elementCenter.y;
	pc.mesh.position.z = -elementCenter.z;
	//pc.mesh.add(new THREE.Box3Helper(b, 0xff0000));

	this.scene.add(pc.mesh);
	pc.mesh.updateMatrixWorld(true);
	this.scene.remove(pc.mesh);
	var [dx,dy] = this.measurer.measure(b, pc.mesh.matrixWorld);
	pc.dx = dx;
	pc.dy = dy;
    }
    return pc;
}

LDR.PLIBuilder.prototype.updateCamera = function(w, h) {
    this.camera.left = -w*0.5;
    this.camera.right = w*0.5;
    this.camera.top = h*0.5;
    this.camera.bottom = -h*0.5;
    this.camera.updateProjectionMatrix();
}

LDR.PLIBuilder.prototype.render = function(key, w, h) {
    var pc = this.getPC(key);
    pc.meshCollector.draw(pc.mesh, false);
    
    this.scene.add(pc.mesh);
    this.renderer.setSize(w+1, h+1); // +1 to ensure edges are in frame in case of rounding down.
    this.updateCamera(pc.dx, pc.dy);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(pc.mesh);
}

LDR.PLIBuilder.prototype.createSortedIcons = function(step, stepColorID) {
    var icons = {}; // key -> {key, partID, colorID, mult, desc}, key='part_id'_'color_id'
    var sortedIcons = [];
    for(var i = 0; i < step.dats.length; i++) {
	var dat = step.dats[i];
	var partID = dat.ID;
	var colorID = dat.colorID == 16 ? stepColorID : dat.colorID;
	var key = partID + '_' + colorID;
	var icon = icons[key];
	if(icon) {
	    icon.mult++;
	}
	else {
	    var pc = this.getPC(key);
	    icon = {key: key,
		    partID: partID, 
		    colorID: colorID, 
		    mult: 1, 
		    desc: this.ldrLoader.ldrPartTypes[partID].modelDescription,
		    dx: pc.dx,
		    dy: pc.dy
		   };
	    icons[key] = icon;
	    sortedIcons.push(icon);
	}
    }
    var sorter = function(a, b){
	var ca = a.desc;
	var cb = b.desc;
	if(ca != cb) {
	    return ca < cb ? -1 : 1;
	}
	var ia = a.colorID;
	var ib = b.colorID;
	return ia < ib ? -1 : (ib < ia ? 1 : 0);
    }
    sortedIcons.sort(sorter);
    return sortedIcons;
}

LDR.PLIBuilder.prototype.drawPLIForStep = function(fillHeight, step, colorID, maxWidth, maxHeight, force) {
    if(!force && this.lastStep && 
       this.lastStep.idx === step.idx && 
       this.lastColorID === colorID &&
       this.lastMaxWidth == maxWidth && this.lastMaxHeight == maxHeight &&
       this.fillHeight == fillHeight) {
	return this.sortedIcons;
    }
    this.lastStep = step;
    this.lastColorID = colorID;
    this.lastMaxWidth = maxWidth;
    this.lastMaxHeight = maxHeight;
    this.fillHeight = fillHeight;

    // Find, sort and set up icons to show:
    this.sortedIcons = this.createSortedIcons(step, colorID);
    var [W,H] = Algorithm.PackRectangles(fillHeight, maxWidth, maxHeight, this.sortedIcons, 200);
    this.pliElement.width = (12+W)*window.devicePixelRatio;
    this.pliElement.height = (16+H)*window.devicePixelRatio;
    this.pliElement.style.width = (W+12)+"px";
    this.pliElement.style.height = (H+16)+"px";

    var context = this.pliElement.getContext('2d');

    context.font = parseInt(25*window.devicePixelRatio) + "px sans-serif";
    context.fillStyle = "black";
    var scaleDown = 0.95; // To make icons not fill out the complete allocated cells.
    var self = this;
    function delay() {
	context.clearRect(0, 0, this.pliElement.width, this.pliElement.height);
	for(var i = 0; i < self.sortedIcons.length; i++) {
	    var icon = self.sortedIcons[i];
	    var w = parseInt(icon.width*scaleDown);
	    var h = parseInt(icon.height*scaleDown);
            self.render(icon.key, w, h);
	    context.drawImage(self.renderer.domElement, (icon.x+8)*window.devicePixelRatio, icon.y*window.devicePixelRatio);
	}
	for(var i = 0; i < self.sortedIcons.length; i++) {
	    var icon = self.sortedIcons[i];
	    context.fillText(icon.mult + "x", 
			     (icon.x + 2)*window.devicePixelRatio, ((icon.y+icon.height) + 10)*window.devicePixelRatio);
	}
    }
    setTimeout(delay, 10); // Ensure not blocking
    return this.sortedIcons;
}
