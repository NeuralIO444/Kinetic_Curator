(module
 (type $0 (func (param f32) (result f32)))
 (type $1 (func (param i32 i32 i32) (result f32)))
 (type $2 (func (param f32 f32) (result f32)))
 (type $3 (func (param i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 f32 f32)))
 (type $4 (func (param i32) (result i32)))
 (type $5 (func))
 (global $assembly/particles/TAU f32 (f32.const 6.2831854820251465))
 (global $assembly/particles/nextPtr (mut i32) (i32.const 1024))
 (global $~lib/native/ASC_SHRINK_LEVEL i32 (i32.const 0))
 (global $~lib/math/rempio2f_y (mut f64) (f64.const 0))
 (memory $0 1)
 (data $0 (i32.const 8) ")\15DNn\83\f9\a2\c0\dd4\f5\d1W\'\fcA\90C<\99\95b\dba\c5\bb\de\abcQ\fe")
 (table $0 1 1 funcref)
 (elem $0 (i32.const 1))
 (export "computeParticles" (func $assembly/particles/computeParticles))
 (export "allocBuffer" (func $assembly/particles/allocBuffer))
 (export "resetAllocator" (func $assembly/particles/resetAllocator))
 (export "memory" (memory $0))
 (func $assembly/particles/rand01 (param $0 i32) (param $1 i32) (param $2 i32) (result f32)
  (local $3 i32)
  local.get $0
  i32.const -1640531535
  i32.mul
  local.get $1
  i32.const 1664525
  i32.mul
  i32.add
  local.get $2
  i32.add
  local.set $3
  local.get $3
  local.get $3
  i32.const 13
  i32.shr_u
  i32.xor
  i32.const 1013904223
  i32.mul
  local.set $3
  local.get $3
  local.get $3
  i32.const 16
  i32.shr_u
  i32.xor
  local.set $3
  local.get $3
  i32.const 65535
  i32.and
  f32.convert_i32_u
  f32.const 65535
  f32.div
  return
 )
 (func $~lib/math/NativeMathf.mod (param $0 f32) (param $1 f32) (result f32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 f32)
  (local $9 i32)
  (local $10 i32)
  local.get $1
  f32.abs
  f32.const 1
  f32.eq
  if
   local.get $0
   local.get $0
   f32.trunc
   f32.sub
   local.get $0
   f32.copysign
   return
  end
  local.get $0
  i32.reinterpret_f32
  local.set $2
  local.get $1
  i32.reinterpret_f32
  local.set $3
  local.get $2
  i32.const 23
  i32.shr_u
  i32.const 255
  i32.and
  local.set $4
  local.get $3
  i32.const 23
  i32.shr_u
  i32.const 255
  i32.and
  local.set $5
  local.get $2
  i32.const -2147483648
  i32.and
  local.set $6
  local.get $3
  i32.const 1
  i32.shl
  local.set $7
  local.get $7
  i32.const 0
  i32.eq
  if (result i32)
   i32.const 1
  else
   local.get $4
   i32.const 255
   i32.eq
  end
  if (result i32)
   i32.const 1
  else
   local.get $1
   local.get $1
   f32.ne
  end
  if
   local.get $0
   local.get $1
   f32.mul
   local.set $8
   local.get $8
   local.get $8
   f32.div
   return
  end
  local.get $2
  i32.const 1
  i32.shl
  local.set $9
  local.get $9
  local.get $7
  i32.le_u
  if
   local.get $0
   local.get $9
   local.get $7
   i32.ne
   f32.convert_i32_u
   f32.mul
   return
  end
  local.get $4
  i32.eqz
  if
   local.get $4
   local.get $2
   i32.const 9
   i32.shl
   i32.clz
   i32.sub
   local.set $4
   local.get $2
   i32.const 1
   local.get $4
   i32.sub
   i32.shl
   local.set $2
  else
   local.get $2
   i32.const -1
   i32.const 9
   i32.shr_u
   i32.and
   local.set $2
   local.get $2
   i32.const 1
   i32.const 23
   i32.shl
   i32.or
   local.set $2
  end
  local.get $5
  i32.eqz
  if
   local.get $5
   local.get $3
   i32.const 9
   i32.shl
   i32.clz
   i32.sub
   local.set $5
   local.get $3
   i32.const 1
   local.get $5
   i32.sub
   i32.shl
   local.set $3
  else
   local.get $3
   i32.const -1
   i32.const 9
   i32.shr_u
   i32.and
   local.set $3
   local.get $3
   i32.const 1
   i32.const 23
   i32.shl
   i32.or
   local.set $3
  end
  loop $while-continue|0
   local.get $4
   local.get $5
   i32.gt_s
   if
    local.get $2
    local.get $3
    i32.ge_u
    if
     local.get $2
     local.get $3
     i32.eq
     if
      f32.const 0
      local.get $0
      f32.mul
      return
     end
     local.get $2
     local.get $3
     i32.sub
     local.set $2
    end
    local.get $2
    i32.const 1
    i32.shl
    local.set $2
    local.get $4
    i32.const 1
    i32.sub
    local.set $4
    br $while-continue|0
   end
  end
  local.get $2
  local.get $3
  i32.ge_u
  if
   local.get $2
   local.get $3
   i32.eq
   if
    f32.const 0
    local.get $0
    f32.mul
    return
   end
   local.get $2
   local.get $3
   i32.sub
   local.set $2
  end
  local.get $2
  i32.const 8
  i32.shl
  i32.clz
  local.set $10
  local.get $4
  local.get $10
  i32.sub
  local.set $4
  local.get $2
  local.get $10
  i32.shl
  local.set $2
  local.get $4
  i32.const 0
  i32.gt_s
  if
   local.get $2
   i32.const 1
   i32.const 23
   i32.shl
   i32.sub
   local.set $2
   local.get $2
   local.get $4
   i32.const 23
   i32.shl
   i32.or
   local.set $2
  else
   local.get $2
   i32.const 0
   local.get $4
   i32.sub
   i32.const 1
   i32.add
   i32.shr_u
   local.set $2
  end
  local.get $2
  local.get $6
  i32.or
  f32.reinterpret_i32
  return
 )
 (func $~lib/math/NativeMathf.sin (param $0 f32) (result f32)
  (local $1 i32)
  (local $2 i32)
  (local $3 f64)
  (local $4 f64)
  (local $5 f64)
  (local $6 f64)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  (local $10 f64)
  (local $11 f64)
  (local $12 f64)
  (local $13 f64)
  (local $14 f64)
  (local $15 f64)
  (local $16 f64)
  (local $17 f64)
  (local $18 f64)
  (local $19 f64)
  (local $20 f64)
  (local $21 f64)
  (local $22 f64)
  (local $23 f64)
  (local $24 f64)
  (local $25 f64)
  (local $26 f64)
  (local $27 f64)
  (local $28 f64)
  (local $29 f64)
  (local $30 f64)
  (local $31 f64)
  (local $32 f64)
  (local $33 f64)
  (local $34 f32)
  (local $35 i32)
  (local $36 i32)
  (local $37 f64)
  (local $38 f32)
  (local $39 i32)
  (local $40 i32)
  (local $41 i64)
  (local $42 i32)
  (local $43 i64)
  (local $44 i64)
  (local $45 i64)
  (local $46 i64)
  (local $47 i64)
  (local $48 i64)
  (local $49 i64)
  (local $50 i64)
  (local $51 i32)
  (local $52 i32)
  (local $53 i32)
  (local $54 f64)
  (local $55 f64)
  (local $56 f64)
  (local $57 f64)
  (local $58 f64)
  (local $59 f64)
  (local $60 f64)
  (local $61 f64)
  (local $62 f64)
  (local $63 f64)
  (local $64 f32)
  local.get $0
  i32.reinterpret_f32
  local.set $1
  local.get $1
  i32.const 31
  i32.shr_u
  local.set $2
  local.get $1
  i32.const 2147483647
  i32.and
  local.set $1
  local.get $1
  i32.const 1061752794
  i32.le_u
  if
   local.get $1
   i32.const 964689920
   i32.lt_u
   if
    local.get $0
    return
   end
   block $~lib/math/sin_kernf|inlined.0 (result f32)
    local.get $0
    f64.promote_f32
    local.set $3
    local.get $3
    local.get $3
    f64.mul
    local.set $4
    local.get $4
    local.get $4
    f64.mul
    local.set $5
    f64.const -1.9839334836096632e-04
    local.get $4
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $6
    local.get $4
    local.get $3
    f64.mul
    local.set $7
    local.get $3
    local.get $7
    f64.const -0.16666666641626524
    local.get $4
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $7
    local.get $5
    f64.mul
    local.get $6
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.0
   end
   return
  end
  i32.const 0
  i32.const 1
  i32.lt_s
  drop
  local.get $1
  i32.const 1081824209
  i32.le_u
  if
   local.get $1
   i32.const 1075235811
   i32.le_u
   if
    local.get $2
    if (result f32)
     block $~lib/math/cos_kernf|inlined.0 (result f32)
      local.get $0
      f64.promote_f32
      f64.const 1.5707963267948966
      f64.add
      local.set $8
      local.get $8
      local.get $8
      f64.mul
      local.set $9
      local.get $9
      local.get $9
      f64.mul
      local.set $10
      f64.const -0.001388676377460993
      local.get $9
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $11
      f32.const 1
      f64.promote_f32
      local.get $9
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $10
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $10
      local.get $9
      f64.mul
      local.get $11
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.0
     end
     f32.neg
    else
     block $~lib/math/cos_kernf|inlined.1 (result f32)
      local.get $0
      f64.promote_f32
      f64.const 1.5707963267948966
      f64.sub
      local.set $12
      local.get $12
      local.get $12
      f64.mul
      local.set $13
      local.get $13
      local.get $13
      f64.mul
      local.set $14
      f64.const -0.001388676377460993
      local.get $13
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $15
      f32.const 1
      f64.promote_f32
      local.get $13
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $14
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $14
      local.get $13
      f64.mul
      local.get $15
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.1
     end
    end
    return
   end
   block $~lib/math/sin_kernf|inlined.1 (result f32)
    local.get $2
    if (result f64)
     local.get $0
     f64.promote_f32
     f64.const 3.141592653589793
     f64.add
    else
     local.get $0
     f64.promote_f32
     f64.const 3.141592653589793
     f64.sub
    end
    f64.neg
    local.set $16
    local.get $16
    local.get $16
    f64.mul
    local.set $17
    local.get $17
    local.get $17
    f64.mul
    local.set $18
    f64.const -1.9839334836096632e-04
    local.get $17
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $19
    local.get $17
    local.get $16
    f64.mul
    local.set $20
    local.get $16
    local.get $20
    f64.const -0.16666666641626524
    local.get $17
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $20
    local.get $18
    f64.mul
    local.get $19
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.1
   end
   return
  end
  local.get $1
  i32.const 1088565717
  i32.le_u
  if
   local.get $1
   i32.const 1085271519
   i32.le_u
   if
    local.get $2
    if (result f32)
     block $~lib/math/cos_kernf|inlined.2 (result f32)
      local.get $0
      f64.promote_f32
      f64.const 4.71238898038469
      f64.add
      local.set $21
      local.get $21
      local.get $21
      f64.mul
      local.set $22
      local.get $22
      local.get $22
      f64.mul
      local.set $23
      f64.const -0.001388676377460993
      local.get $22
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $24
      f32.const 1
      f64.promote_f32
      local.get $22
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $23
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $23
      local.get $22
      f64.mul
      local.get $24
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.2
     end
    else
     block $~lib/math/cos_kernf|inlined.3 (result f32)
      local.get $0
      f64.promote_f32
      f64.const 4.71238898038469
      f64.sub
      local.set $25
      local.get $25
      local.get $25
      f64.mul
      local.set $26
      local.get $26
      local.get $26
      f64.mul
      local.set $27
      f64.const -0.001388676377460993
      local.get $26
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $28
      f32.const 1
      f64.promote_f32
      local.get $26
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $27
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $27
      local.get $26
      f64.mul
      local.get $28
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.3
     end
     f32.neg
    end
    return
   end
   block $~lib/math/sin_kernf|inlined.2 (result f32)
    local.get $2
    if (result f64)
     local.get $0
     f64.promote_f32
     f64.const 6.283185307179586
     f64.add
    else
     local.get $0
     f64.promote_f32
     f64.const 6.283185307179586
     f64.sub
    end
    local.set $29
    local.get $29
    local.get $29
    f64.mul
    local.set $30
    local.get $30
    local.get $30
    f64.mul
    local.set $31
    f64.const -1.9839334836096632e-04
    local.get $30
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $32
    local.get $30
    local.get $29
    f64.mul
    local.set $33
    local.get $29
    local.get $33
    f64.const -0.16666666641626524
    local.get $30
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $33
    local.get $31
    f64.mul
    local.get $32
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.2
   end
   return
  end
  local.get $1
  i32.const 2139095040
  i32.ge_u
  if
   local.get $0
   local.get $0
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.0 (result i32)
   local.get $0
   local.set $34
   local.get $1
   local.set $35
   local.get $2
   local.set $36
   local.get $35
   i32.const 1305022427
   i32.lt_u
   if
    local.get $34
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.set $37
    local.get $34
    f64.promote_f32
    local.get $37
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $37
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $37
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.0
   end
   block $~lib/math/pio2f_large_quot|inlined.0 (result i32)
    local.get $34
    local.set $38
    local.get $35
    local.set $39
    local.get $39
    i32.const 23
    i32.shr_s
    i32.const 152
    i32.sub
    local.set $40
    local.get $40
    i32.const 63
    i32.and
    i64.extend_i32_s
    local.set $41
    i32.const 8
    local.get $40
    i32.const 6
    i32.shr_s
    i32.const 3
    i32.shl
    i32.add
    local.set $42
    local.get $42
    i64.load
    local.set $43
    local.get $42
    i64.load offset=8
    local.set $44
    local.get $41
    i64.const 32
    i64.gt_u
    if
     local.get $42
     i64.load offset=16
     local.set $46
     local.get $46
     i64.const 96
     local.get $41
     i64.sub
     i64.shr_u
     local.set $45
     local.get $45
     local.get $44
     local.get $41
     i64.const 32
     i64.sub
     i64.shl
     i64.or
     local.set $45
    else
     local.get $44
     i64.const 32
     local.get $41
     i64.sub
     i64.shr_u
     local.set $45
    end
    local.get $44
    i64.const 64
    local.get $41
    i64.sub
    i64.shr_u
    local.get $43
    local.get $41
    i64.shl
    i64.or
    local.set $47
    local.get $39
    i32.const 8388607
    i32.and
    i32.const 8388608
    i32.or
    i64.extend_i32_s
    local.set $48
    local.get $48
    local.get $47
    i64.mul
    local.get $48
    local.get $45
    i64.mul
    i64.const 32
    i64.shr_u
    i64.add
    local.set $49
    local.get $49
    i64.const 2
    i64.shl
    local.set $50
    local.get $49
    i64.const 62
    i64.shr_u
    local.get $50
    i64.const 63
    i64.shr_u
    i64.add
    i32.wrap_i64
    local.set $51
    f64.const 8.515303950216386e-20
    local.get $38
    f64.promote_f32
    f64.copysign
    local.get $50
    f64.convert_i64_s
    f64.mul
    global.set $~lib/math/rempio2f_y
    local.get $51
    br $~lib/math/pio2f_large_quot|inlined.0
   end
   local.set $52
   i32.const 0
   local.get $52
   i32.sub
   local.get $52
   local.get $36
   select
   br $~lib/math/rempio2f|inlined.0
  end
  local.set $53
  global.get $~lib/math/rempio2f_y
  local.set $54
  local.get $53
  i32.const 1
  i32.and
  if (result f32)
   block $~lib/math/cos_kernf|inlined.4 (result f32)
    local.get $54
    local.set $55
    local.get $55
    local.get $55
    f64.mul
    local.set $56
    local.get $56
    local.get $56
    f64.mul
    local.set $57
    f64.const -0.001388676377460993
    local.get $56
    f64.const 2.439044879627741e-05
    f64.mul
    f64.add
    local.set $58
    f32.const 1
    f64.promote_f32
    local.get $56
    f64.const -0.499999997251031
    f64.mul
    f64.add
    local.get $57
    f64.const 0.04166662332373906
    f64.mul
    f64.add
    local.get $57
    local.get $56
    f64.mul
    local.get $58
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/cos_kernf|inlined.4
   end
  else
   block $~lib/math/sin_kernf|inlined.3 (result f32)
    local.get $54
    local.set $59
    local.get $59
    local.get $59
    f64.mul
    local.set $60
    local.get $60
    local.get $60
    f64.mul
    local.set $61
    f64.const -1.9839334836096632e-04
    local.get $60
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $62
    local.get $60
    local.get $59
    f64.mul
    local.set $63
    local.get $59
    local.get $63
    f64.const -0.16666666641626524
    local.get $60
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $63
    local.get $61
    f64.mul
    local.get $62
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.3
   end
  end
  local.set $64
  local.get $53
  i32.const 2
  i32.and
  if (result f32)
   local.get $64
   f32.neg
  else
   local.get $64
  end
  return
 )
 (func $~lib/math/NativeMathf.cos (param $0 f32) (result f32)
  (local $1 i32)
  (local $2 i32)
  (local $3 f64)
  (local $4 f64)
  (local $5 f64)
  (local $6 f64)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  (local $10 f64)
  (local $11 f64)
  (local $12 f64)
  (local $13 f64)
  (local $14 f64)
  (local $15 f64)
  (local $16 f64)
  (local $17 f64)
  (local $18 f64)
  (local $19 f64)
  (local $20 f64)
  (local $21 f64)
  (local $22 f64)
  (local $23 f64)
  (local $24 f64)
  (local $25 f64)
  (local $26 f64)
  (local $27 f64)
  (local $28 f64)
  (local $29 f64)
  (local $30 f64)
  (local $31 f64)
  (local $32 f64)
  (local $33 f64)
  (local $34 f64)
  (local $35 f32)
  (local $36 i32)
  (local $37 i32)
  (local $38 f64)
  (local $39 f32)
  (local $40 i32)
  (local $41 i32)
  (local $42 i64)
  (local $43 i32)
  (local $44 i64)
  (local $45 i64)
  (local $46 i64)
  (local $47 i64)
  (local $48 i64)
  (local $49 i64)
  (local $50 i64)
  (local $51 i64)
  (local $52 i32)
  (local $53 i32)
  (local $54 i32)
  (local $55 f64)
  (local $56 f64)
  (local $57 f64)
  (local $58 f64)
  (local $59 f64)
  (local $60 f64)
  (local $61 f64)
  (local $62 f64)
  (local $63 f64)
  (local $64 f64)
  (local $65 f32)
  local.get $0
  i32.reinterpret_f32
  local.set $1
  local.get $1
  i32.const 31
  i32.shr_u
  local.set $2
  local.get $1
  i32.const 2147483647
  i32.and
  local.set $1
  local.get $1
  i32.const 1061752794
  i32.le_u
  if
   local.get $1
   i32.const 964689920
   i32.lt_u
   if
    f32.const 1
    return
   end
   block $~lib/math/cos_kernf|inlined.5 (result f32)
    local.get $0
    f64.promote_f32
    local.set $3
    local.get $3
    local.get $3
    f64.mul
    local.set $4
    local.get $4
    local.get $4
    f64.mul
    local.set $5
    f64.const -0.001388676377460993
    local.get $4
    f64.const 2.439044879627741e-05
    f64.mul
    f64.add
    local.set $6
    f32.const 1
    f64.promote_f32
    local.get $4
    f64.const -0.499999997251031
    f64.mul
    f64.add
    local.get $5
    f64.const 0.04166662332373906
    f64.mul
    f64.add
    local.get $5
    local.get $4
    f64.mul
    local.get $6
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/cos_kernf|inlined.5
   end
   return
  end
  i32.const 0
  i32.const 1
  i32.lt_s
  drop
  local.get $1
  i32.const 1081824209
  i32.le_u
  if
   local.get $1
   i32.const 1075235811
   i32.gt_u
   if
    block $~lib/math/cos_kernf|inlined.6 (result f32)
     local.get $2
     if (result f64)
      local.get $0
      f64.promote_f32
      f64.const 3.141592653589793
      f64.add
     else
      local.get $0
      f64.promote_f32
      f64.const 3.141592653589793
      f64.sub
     end
     local.set $7
     local.get $7
     local.get $7
     f64.mul
     local.set $8
     local.get $8
     local.get $8
     f64.mul
     local.set $9
     f64.const -0.001388676377460993
     local.get $8
     f64.const 2.439044879627741e-05
     f64.mul
     f64.add
     local.set $10
     f32.const 1
     f64.promote_f32
     local.get $8
     f64.const -0.499999997251031
     f64.mul
     f64.add
     local.get $9
     f64.const 0.04166662332373906
     f64.mul
     f64.add
     local.get $9
     local.get $8
     f64.mul
     local.get $10
     f64.mul
     f64.add
     f32.demote_f64
     br $~lib/math/cos_kernf|inlined.6
    end
    f32.neg
    return
   else
    local.get $2
    if (result f32)
     block $~lib/math/sin_kernf|inlined.4 (result f32)
      local.get $0
      f64.promote_f32
      f64.const 1.5707963267948966
      f64.add
      local.set $11
      local.get $11
      local.get $11
      f64.mul
      local.set $12
      local.get $12
      local.get $12
      f64.mul
      local.set $13
      f64.const -1.9839334836096632e-04
      local.get $12
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $14
      local.get $12
      local.get $11
      f64.mul
      local.set $15
      local.get $11
      local.get $15
      f64.const -0.16666666641626524
      local.get $12
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $15
      local.get $13
      f64.mul
      local.get $14
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.4
     end
    else
     block $~lib/math/sin_kernf|inlined.5 (result f32)
      f64.const 1.5707963267948966
      local.get $0
      f64.promote_f32
      f64.sub
      local.set $16
      local.get $16
      local.get $16
      f64.mul
      local.set $17
      local.get $17
      local.get $17
      f64.mul
      local.set $18
      f64.const -1.9839334836096632e-04
      local.get $17
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $19
      local.get $17
      local.get $16
      f64.mul
      local.set $20
      local.get $16
      local.get $20
      f64.const -0.16666666641626524
      local.get $17
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $20
      local.get $18
      f64.mul
      local.get $19
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.5
     end
    end
    return
   end
   unreachable
  end
  local.get $1
  i32.const 1088565717
  i32.le_u
  if
   local.get $1
   i32.const 1085271519
   i32.gt_u
   if
    block $~lib/math/cos_kernf|inlined.7 (result f32)
     local.get $2
     if (result f64)
      local.get $0
      f64.promote_f32
      f64.const 6.283185307179586
      f64.add
     else
      local.get $0
      f64.promote_f32
      f64.const 6.283185307179586
      f64.sub
     end
     local.set $21
     local.get $21
     local.get $21
     f64.mul
     local.set $22
     local.get $22
     local.get $22
     f64.mul
     local.set $23
     f64.const -0.001388676377460993
     local.get $22
     f64.const 2.439044879627741e-05
     f64.mul
     f64.add
     local.set $24
     f32.const 1
     f64.promote_f32
     local.get $22
     f64.const -0.499999997251031
     f64.mul
     f64.add
     local.get $23
     f64.const 0.04166662332373906
     f64.mul
     f64.add
     local.get $23
     local.get $22
     f64.mul
     local.get $24
     f64.mul
     f64.add
     f32.demote_f64
     br $~lib/math/cos_kernf|inlined.7
    end
    return
   else
    local.get $2
    if (result f32)
     block $~lib/math/sin_kernf|inlined.6 (result f32)
      local.get $0
      f32.neg
      f64.promote_f32
      f64.const 4.71238898038469
      f64.sub
      local.set $25
      local.get $25
      local.get $25
      f64.mul
      local.set $26
      local.get $26
      local.get $26
      f64.mul
      local.set $27
      f64.const -1.9839334836096632e-04
      local.get $26
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $28
      local.get $26
      local.get $25
      f64.mul
      local.set $29
      local.get $25
      local.get $29
      f64.const -0.16666666641626524
      local.get $26
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $29
      local.get $27
      f64.mul
      local.get $28
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.6
     end
    else
     block $~lib/math/sin_kernf|inlined.7 (result f32)
      local.get $0
      f64.promote_f32
      f64.const 4.71238898038469
      f64.sub
      local.set $30
      local.get $30
      local.get $30
      f64.mul
      local.set $31
      local.get $31
      local.get $31
      f64.mul
      local.set $32
      f64.const -1.9839334836096632e-04
      local.get $31
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $33
      local.get $31
      local.get $30
      f64.mul
      local.set $34
      local.get $30
      local.get $34
      f64.const -0.16666666641626524
      local.get $31
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $34
      local.get $32
      f64.mul
      local.get $33
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.7
     end
    end
    return
   end
   unreachable
  end
  local.get $1
  i32.const 2139095040
  i32.ge_u
  if
   local.get $0
   local.get $0
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.1 (result i32)
   local.get $0
   local.set $35
   local.get $1
   local.set $36
   local.get $2
   local.set $37
   local.get $36
   i32.const 1305022427
   i32.lt_u
   if
    local.get $35
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.set $38
    local.get $35
    f64.promote_f32
    local.get $38
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $38
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $38
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.1
   end
   block $~lib/math/pio2f_large_quot|inlined.1 (result i32)
    local.get $35
    local.set $39
    local.get $36
    local.set $40
    local.get $40
    i32.const 23
    i32.shr_s
    i32.const 152
    i32.sub
    local.set $41
    local.get $41
    i32.const 63
    i32.and
    i64.extend_i32_s
    local.set $42
    i32.const 8
    local.get $41
    i32.const 6
    i32.shr_s
    i32.const 3
    i32.shl
    i32.add
    local.set $43
    local.get $43
    i64.load
    local.set $44
    local.get $43
    i64.load offset=8
    local.set $45
    local.get $42
    i64.const 32
    i64.gt_u
    if
     local.get $43
     i64.load offset=16
     local.set $47
     local.get $47
     i64.const 96
     local.get $42
     i64.sub
     i64.shr_u
     local.set $46
     local.get $46
     local.get $45
     local.get $42
     i64.const 32
     i64.sub
     i64.shl
     i64.or
     local.set $46
    else
     local.get $45
     i64.const 32
     local.get $42
     i64.sub
     i64.shr_u
     local.set $46
    end
    local.get $45
    i64.const 64
    local.get $42
    i64.sub
    i64.shr_u
    local.get $44
    local.get $42
    i64.shl
    i64.or
    local.set $48
    local.get $40
    i32.const 8388607
    i32.and
    i32.const 8388608
    i32.or
    i64.extend_i32_s
    local.set $49
    local.get $49
    local.get $48
    i64.mul
    local.get $49
    local.get $46
    i64.mul
    i64.const 32
    i64.shr_u
    i64.add
    local.set $50
    local.get $50
    i64.const 2
    i64.shl
    local.set $51
    local.get $50
    i64.const 62
    i64.shr_u
    local.get $51
    i64.const 63
    i64.shr_u
    i64.add
    i32.wrap_i64
    local.set $52
    f64.const 8.515303950216386e-20
    local.get $39
    f64.promote_f32
    f64.copysign
    local.get $51
    f64.convert_i64_s
    f64.mul
    global.set $~lib/math/rempio2f_y
    local.get $52
    br $~lib/math/pio2f_large_quot|inlined.1
   end
   local.set $53
   i32.const 0
   local.get $53
   i32.sub
   local.get $53
   local.get $37
   select
   br $~lib/math/rempio2f|inlined.1
  end
  local.set $54
  global.get $~lib/math/rempio2f_y
  local.set $55
  local.get $54
  i32.const 1
  i32.and
  if (result f32)
   block $~lib/math/sin_kernf|inlined.8 (result f32)
    local.get $55
    local.set $56
    local.get $56
    local.get $56
    f64.mul
    local.set $57
    local.get $57
    local.get $57
    f64.mul
    local.set $58
    f64.const -1.9839334836096632e-04
    local.get $57
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $59
    local.get $57
    local.get $56
    f64.mul
    local.set $60
    local.get $56
    local.get $60
    f64.const -0.16666666641626524
    local.get $57
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $60
    local.get $58
    f64.mul
    local.get $59
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.8
   end
  else
   block $~lib/math/cos_kernf|inlined.8 (result f32)
    local.get $55
    local.set $61
    local.get $61
    local.get $61
    f64.mul
    local.set $62
    local.get $62
    local.get $62
    f64.mul
    local.set $63
    f64.const -0.001388676377460993
    local.get $62
    f64.const 2.439044879627741e-05
    f64.mul
    f64.add
    local.set $64
    f32.const 1
    f64.promote_f32
    local.get $62
    f64.const -0.499999997251031
    f64.mul
    f64.add
    local.get $63
    f64.const 0.04166662332373906
    f64.mul
    f64.add
    local.get $63
    local.get $62
    f64.mul
    local.get $64
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/cos_kernf|inlined.8
   end
  end
  local.set $65
  local.get $54
  i32.const 1
  i32.add
  i32.const 2
  i32.and
  if (result f32)
   local.get $65
   f32.neg
  else
   local.get $65
  end
  return
 )
 (func $assembly/particles/computeParticles (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 f32) (param $7 f32) (param $8 i32) (param $9 i32) (param $10 f32) (param $11 f32)
  (local $12 f32)
  (local $13 i32)
  (local $14 f32)
  (local $15 f32)
  (local $16 f32)
  (local $17 f32)
  (local $18 f32)
  (local $19 f32)
  (local $20 f32)
  (local $21 f32)
  (local $22 f32)
  (local $23 f32)
  (local $24 f32)
  local.get $6
  f32.const 1.0000000474974513e-03
  f32.mul
  local.get $7
  f32.mul
  local.set $12
  i32.const 0
  local.set $13
  loop $for-loop|0
   local.get $13
   local.get $4
   i32.lt_s
   if
    local.get $5
    local.get $13
    i32.const 0
    call $assembly/particles/rand01
    global.get $assembly/particles/TAU
    f32.mul
    local.set $14
    local.get $5
    local.get $13
    i32.const 1
    call $assembly/particles/rand01
    local.set $15
    local.get $5
    local.get $13
    i32.const 2
    call $assembly/particles/rand01
    f32.const 0.5
    f32.add
    local.set $16
    local.get $5
    local.get $13
    i32.const 3
    call $assembly/particles/rand01
    local.set $17
    f32.const 0
    local.set $18
    f32.const 0
    local.set $19
    local.get $8
    i32.const 0
    i32.ne
    if
     local.get $9
     i32.const 0
     i32.eq
     if
      local.get $15
      local.get $11
      f32.mul
      local.set $20
      local.get $14
      f32.const 60
      f32.mul
      local.get $12
      f32.const 90
      f32.mul
      local.get $16
      f32.mul
      f32.add
      local.get $10
      f32.const 200
      f32.add
      call $~lib/math/NativeMathf.mod
      local.set $21
      local.get $21
      f32.const 100
      f32.sub
      local.set $18
      local.get $20
      local.get $12
      f32.const 0.6000000238418579
      f32.mul
      local.get $14
      f32.add
      call $~lib/math/NativeMathf.sin
      local.get $11
      f32.mul
      f32.const 0.11999999731779099
      f32.mul
      f32.add
      local.set $19
     else
      local.get $9
      i32.const 2
      i32.eq
      if
       local.get $11
       f32.const 0.18000000715255737
       local.get $15
       f32.const 0.3199999928474426
       f32.mul
       f32.add
       f32.mul
       local.set $22
       local.get $13
       i32.const 1
       i32.and
       i32.const 0
       i32.eq
       if (result f32)
        f32.const 1
       else
        f32.const -1
       end
       local.set $23
       local.get $12
       f32.const 0.3499999940395355
       f32.mul
       local.get $16
       f32.mul
       local.get $23
       f32.mul
       local.set $24
       local.get $10
       f32.const 0.5
       f32.mul
       local.get $14
       local.get $24
       f32.add
       call $~lib/math/NativeMathf.cos
       local.get $22
       f32.mul
       f32.add
       local.set $18
       local.get $11
       f32.const 0.5
       f32.mul
       local.get $14
       local.get $24
       f32.add
       call $~lib/math/NativeMathf.sin
       local.get $22
       f32.mul
       f32.add
       local.set $19
      else
       local.get $10
       f32.const 0.5
       f32.mul
       local.get $12
       local.get $16
       f32.mul
       f32.const 0.699999988079071
       f32.mul
       local.get $14
       f32.add
       call $~lib/math/NativeMathf.sin
       local.get $10
       f32.mul
       f32.const 0.41999998688697815
       f32.mul
       f32.add
       local.set $18
       local.get $11
       f32.const 0.5
       f32.mul
       local.get $12
       local.get $16
       f32.mul
       f32.const 0.8999999761581421
       f32.mul
       local.get $14
       f32.const 1.2999999523162842
       f32.mul
       f32.add
       call $~lib/math/NativeMathf.cos
       local.get $11
       f32.mul
       f32.const 0.41999998688697815
       f32.mul
       f32.add
       local.set $19
      end
     end
    else
     local.get $15
     local.get $10
     f32.mul
     local.set $18
     local.get $14
     f32.const 1e3
     f32.mul
     local.get $11
     call $~lib/math/NativeMathf.mod
     local.set $19
    end
    local.get $0
    local.get $13
    i32.const 2
    i32.shl
    i32.add
    local.get $18
    f32.store
    local.get $1
    local.get $13
    i32.const 2
    i32.shl
    i32.add
    local.get $19
    f32.store
    local.get $2
    local.get $13
    i32.const 2
    i32.shl
    i32.add
    f32.const 0.15000000596046448
    local.get $17
    f32.const 0.550000011920929
    f32.mul
    f32.add
    f32.store
    local.get $3
    local.get $13
    i32.const 2
    i32.shl
    i32.add
    f32.const 45
    local.get $17
    f32.const 55
    f32.mul
    f32.add
    f32.store
    local.get $13
    i32.const 1
    i32.add
    local.set $13
    br $for-loop|0
   end
  end
 )
 (func $assembly/particles/allocBuffer (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  global.get $assembly/particles/nextPtr
  local.set $1
  global.get $assembly/particles/nextPtr
  local.get $0
  i32.add
  global.set $assembly/particles/nextPtr
  global.get $assembly/particles/nextPtr
  i32.const 16
  i32.shr_u
  i32.const 1
  i32.add
  local.set $2
  memory.size
  local.set $3
  local.get $2
  local.get $3
  i32.gt_s
  if
   local.get $2
   local.get $3
   i32.sub
   memory.grow
   drop
  end
  local.get $1
  return
 )
 (func $assembly/particles/resetAllocator
  i32.const 1024
  global.set $assembly/particles/nextPtr
 )
)
