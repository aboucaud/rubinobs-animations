# Export batoid LSST prescription (per band) + reference ray traces to JSON
import batoid, numpy as np, json
wl = dict(u=365e-9,g=480e-9,r=622e-9,i=755e-9,z=869e-9,y=971e-9)
out = {}
for b in "ugrizy":
    tel = batoid.Optic.fromYaml(f"LSST_{b}.yaml")
    surfs = []
    for name in ["M1","M2","M3","L1_entrance","L1_exit","L2_entrance","L2_exit","Filter_entrance","Filter_exit","L3_entrance","L3_exit","Detector"]:
        o = tel[name]; s = o.surface
        d = dict(name=name, z=float(o.coordSys.origin[2]), type=type(s).__name__)
        if hasattr(s,'R'): d['R']=float(s.R)
        if hasattr(s,'conic'): d['k']=float(s.conic)
        if hasattr(s,'coefs'): d['coefs']=[float(c) for c in s.coefs]
        ob = o.obscuration
        if ob is not None:
            oo = ob.original if hasattr(ob,'original') else ob
            for a in ['inner','outer','radius']:
                if hasattr(oo,a): d[a]=float(getattr(oo,a))
        surfs.append(d)
    n = float(tel['L1'].medium.getN(wl[b]))
    # reference traces
    refs=[]
    for th in [0.0, 0.5, 1.0, 1.5, 1.75]:
        rays = batoid.RayVector.asPolar(optic=tel, wavelength=wl[b], theta_x=0, theta_y=np.deg2rad(th), nrad=6, naz=12)
        tr = tel.trace(rays.copy())
        ok = ~tr.vignetted
        refs.append(dict(theta=th, x=float(np.mean(tr.x[ok])), y=float(np.mean(tr.y[ok])), rms=float(np.sqrt(np.mean((tr.x[ok]-tr.x[ok].mean())**2+(tr.y[ok]-tr.y[ok].mean())**2))), n=int(ok.sum())))
    out[b]=dict(wavelength=wl[b], n_silica=n, surfaces=surfs, ref=refs)
json.dump(out, open('/home/claude/rubin/tools/prescription.json','w'), indent=1)
for b in out: print(b, out[b]['n_silica'], [(r['theta'], round(r['y']*1e3,3), round(r['rms']*1e6,2), r['n']) for r in out[b]['ref']])
# raw individual rays for the r band, for exact validation of the JS tracer
tel = batoid.Optic.fromYaml("LSST_r.yaml")
rays = batoid.RayVector.asPolar(optic=tel, wavelength=622e-9, theta_x=np.deg2rad(0.3), theta_y=np.deg2rad(1.2), nrad=3, naz=6)
r0 = rays.copy()
tr = tel.trace(rays.copy())
raw=[dict(p=[float(r0.x[i]),float(r0.y[i]),float(r0.z[i])], d=[float(r0.vx[i]),float(r0.vy[i]),float(r0.vz[i])], out=[float(tr.x[i]),float(tr.y[i])], vig=bool(tr.vignetted[i])) for i in range(len(r0))]
out['raw_r']=raw
json.dump(out, open('/home/claude/rubin/tools/prescription.json','w'), indent=1)
print(raw[:3])
